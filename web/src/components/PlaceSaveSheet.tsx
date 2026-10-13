"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/types/place";
import {
  useNearbyPlaces,
  type NearbyPlaceCandidate,
} from "@/hooks/useNearbyPlaces";

export type PlaceSheetState =
  | { status: "locating" }
  | { status: "ready"; lat: number; lng: number; accuracy: number | null }
  | { status: "error"; message: string };

type PlaceSaveSheetProps = {
  state: PlaceSheetState;
  onRetry: () => void;
  onSave: (
    name: string,
    category: PlaceCategory,
    providerId: string | null,
  ) => void;
  onCancel: () => void;
};

const focusOutlineClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00bfff]";

function CategoryIcon({ category }: { category: PlaceCategory }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (category === "cafe") {
    return (
      <svg {...common}>
        <path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
        <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M4 22h15" />
      </svg>
    );
  }

  if (category === "restaurant") {
    return (
      <svg {...common}>
        <path d="M6 3v7M3.5 3v4.5A2.5 2.5 0 0 0 6 10a2.5 2.5 0 0 0 2.5-2.5V3M6 10v11M15 3v18M15 3c4 2 5 7 0 10" />
      </svg>
    );
  }

  if (category === "bar") {
    return (
      <svg {...common}>
        <path d="M4 4h16l-6.5 7.5V20M8 20h9M7 8h10" />
      </svg>
    );
  }

  if (category === "park") {
    return (
      <svg {...common}>
        <path d="M12 22v-8M12 18l-4-4M12 16l4-4" />
        <circle cx="12" cy="8" r="6" />
      </svg>
    );
  }

  if (category === "shop") {
    return (
      <svg {...common}>
        <path d="M4 9h16v12H4V9ZM3 9l2-6h14l2 6M8 3 7 0M9 13h6" />
      </svg>
    );
  }

  if (category === "culture") {
    return (
      <svg {...common}>
        <path d="M3 5c4-2 7-2 9 0v12c-2-2-5-2-9 0V5ZM21 5c-4-2-7-2-9 0v12c2-2 5-2 9 0V5Z" />
        <path d="M6 9h3M15 9h3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function PlaceSaveSheet({
  state,
  onRetry,
  onSave,
  onCancel,
}: PlaceSaveSheetProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const titleId = useId();
  const inputId = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nearby = useNearbyPlaces(
    state.status === "ready" ? state.lat : null,
    state.status === "ready" ? state.lng : null,
  );

  const trimmed = name.trim();
  const canSave =
    state.status === "ready" && trimmed.length > 0 && category !== null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || category === null) return;
    onSave(trimmed, category, selectedId);
  }

  function handlePickCandidate(place: NearbyPlaceCandidate) {
    setName(place.name.slice(0, 60));
    setCategory(place.category);
    setSelectedId(place.providerId);
  }

  function handleNameChange(value: string) {
    setName(value);
    setSelectedId(null);
  }

  const locationTone =
    state.status === "ready" && state.accuracy !== null && state.accuracy > 50
      ? "bg-[#f1a447]"
      : state.status === "error"
        ? "bg-[#ff715c]"
        : "bg-[#71d08c]";

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center sm:p-4"
      role="presentation"
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reducedMotion ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.22 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(86dvh,760px)] w-full max-w-none flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-white/10 bg-[linear-gradient(145deg,rgba(14,23,34,.97),rgba(5,11,20,.99))] text-white shadow-[0_-24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:max-w-[480px] sm:rounded-[28px] sm:border-b"
        initial={{ y: reducedMotion ? 0 : "100%" }}
        animate={{ y: 0 }}
        exit={{ y: reducedMotion ? 0 : "100%" }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 300, damping: 31, mass: 0.9 }
        }
        drag={reducedMotion ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.35 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 850) onCancel();
        }}
      >
        <div className="flex justify-center pb-1 pt-3" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <header className="flex items-start justify-between px-5 pb-4 pt-2">
          <div>
            <div
              className="mb-3 h-px w-10 bg-[#00bfff]/70"
              aria-hidden="true"
            />
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#00bfff]">
              PLACE
            </p>
            <h2
              id={titleId}
              className="text-[22px] font-semibold tracking-[-0.025em]"
            >
              이 장소를 기억할까요?
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="장소 저장 닫기"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#8fa3b8] transition-colors hover:bg-[#00bfff]/10 hover:text-white active:scale-90 ${focusOutlineClass}`}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <section
            aria-label="위치 상태"
            className="flex min-h-12 items-center gap-3 border-y border-white/[0.08] py-3"
          >
            {state.status === "locating" ? (
              <span className="relative h-2.5 w-2.5 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#00bfff]/60" />
                <span className="absolute inset-[2px] rounded-full bg-[#00bfff]" />
              </span>
            ) : (
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${locationTone}`}
              />
            )}

            <div className="min-w-0 flex-1">
              {state.status === "locating" && (
                <p className="text-[13px] text-[#8fa3b8]">
                  현재 위치를 확인하고 있어요
                </p>
              )}
              {state.status === "ready" && (
                <p className="text-[13px] text-[#8fa3b8]">
                  위치 확인됨
                  {state.accuracy !== null && (
                    <span className="ml-2 text-[#5f7387]">
                      오차 약 {Math.round(state.accuracy)}m
                    </span>
                  )}
                </p>
              )}
              {state.status === "error" && (
                <p className="truncate text-[13px] text-[#ff9c8d]">
                  {state.message}
                </p>
              )}
            </div>

            {state.status === "error" && (
              <button
                type="button"
                onClick={onRetry}
                className={`min-h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold text-[#00bfff] transition-colors hover:text-[#33ccff] active:opacity-60 ${focusOutlineClass}`}
              >
                다시 시도
              </button>
            )}
          </section>

          {state.status === "ready" && nearby.status === "loading" && (
            <div className="mt-5" role="status" aria-label="주변 장소 검색 중">
              <div className="mb-3 h-3 w-20 animate-pulse rounded-full bg-white/[0.08]" />
              <div className="space-y-2">
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.04]"
                  />
                ))}
              </div>
            </div>
          )}

          {nearby.status === "done" && nearby.places.length > 0 && (
            <section className="mt-5" aria-labelledby={`${titleId}-nearby`}>
              <div className="mb-2.5 flex items-center justify-between">
                <h3
                  id={`${titleId}-nearby`}
                  className="text-[12px] font-medium tracking-[0.08em] text-[#5f7387]"
                >
                  가까운 장소
                </h3>
                <span className="text-[12px] tabular-nums text-[#5f7387]">
                  200m
                </span>
              </div>

              <ul className="divide-y divide-white/[0.07]">
                {nearby.places.slice(0, 4).map((place) => {
                  const selected = selectedId === place.providerId;

                  return (
                    <li key={place.providerId}>
                      <button
                        type="button"
                        onClick={() => handlePickCandidate(place)}
                        aria-pressed={selected}
                        className={`group flex min-h-[58px] w-full items-center gap-3 rounded-xl text-left active:opacity-65 ${focusOutlineClass}`}
                      >
                        <span
                          className={[
                            "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors",
                            selected
                              ? "bg-[#00bfff] text-[#04121c]"
                              : "bg-white/[0.05] text-[#8fa3b8] group-hover:bg-[#00bfff]/10 group-hover:text-[#33ccff]",
                          ].join(" ")}
                        >
                          <CategoryIcon category={place.category} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span
                            className={[
                              "block truncate text-[14px] font-medium",
                              selected ? "text-white" : "text-neutral-200",
                            ].join(" ")}
                          >
                            {place.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-[#5f7387]">
                            {place.categoryName.split(" > ").slice(-1)[0]}
                          </span>
                        </span>

                        <span className="shrink-0 text-[12px] tabular-nums text-[#5f7387]">
                          {place.distanceMeters}m
                        </span>

                        <span
                          className={[
                            "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                            selected
                              ? "border-[#00bfff] bg-[#00bfff] text-[#04121c]"
                              : "border-white/15 text-transparent",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          <CheckIcon />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {nearby.status === "done" && nearby.places.length === 0 && (
            <p className="mt-5 text-[13px] leading-relaxed text-[#5f7387]">
              가까운 추천 장소가 없어요. 이름을 직접 입력해 주세요.
            </p>
          )}

          {nearby.status === "error" && (
            <p className="mt-5 text-[13px] leading-relaxed text-[#5f7387]">
              주변 장소를 불러오지 못했어요. 직접 입력은 계속할 수 있어요.
            </p>
          )}

          <div className="mt-5">
            <label htmlFor={inputId} className="sr-only">
              장소 이름
            </label>
            <input
              id={inputId}
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              maxLength={60}
              placeholder="장소 이름"
              autoComplete="off"
              className="h-14 w-full rounded-full bg-[#0a121c] px-[22px] text-[16px] font-medium text-white caret-[#00bfff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)] outline-none transition placeholder:text-[#5f7387] focus:bg-[#0a121c] focus:shadow-[inset_0_0_0_1px_rgba(0,191,255,0.6),0_0_0_4px_rgba(0,191,255,0.15)]"
            />
          </div>

          <fieldset className="mt-5 min-w-0">
            <legend className="mb-3 text-[12px] font-medium tracking-[0.08em] text-[#5f7387]">
              카테고리
            </legend>

            <div className="grid grid-cols-4 gap-2">
              {PLACE_CATEGORIES.map((item) => {
                const selected = category === item.key;

                return (
                  <motion.button
                    key={item.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(item.key)}
                    whileTap={reducedMotion ? undefined : { scale: 0.94 }}
                    className={[
                      "flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[20px] border px-1 text-[12px] font-medium transition-colors",
                      focusOutlineClass,
                      selected
                        ? "border-[#00bfff] bg-[#00bfff] font-semibold text-[#04121c] shadow-[0_10px_28px_rgba(0,191,255,0.25)]"
                        : "border-white/[0.08] bg-[#0e1722] text-[#8fa3b8] hover:border-[#00bfff]/30 hover:bg-[#00bfff]/10 hover:text-white",
                    ].join(" ")}
                  >
                    <CategoryIcon category={item.key} />
                    <span className="w-full truncate text-center">
                      {item.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <footer className="border-t border-white/[0.08] bg-[#050b14]/40 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
          <motion.button
            type="submit"
            disabled={!canSave}
            whileTap={canSave && !reducedMotion ? { scale: 0.98 } : undefined}
            className={`flex h-14 w-full items-center justify-center rounded-full bg-[#00bfff] text-[15px] font-extrabold tracking-[0.04em] text-[#04121c] shadow-[0_10px_28px_rgba(0,191,255,0.25)] transition hover:bg-[#33ccff] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-[#5f7387] disabled:shadow-none ${focusOutlineClass}`}
          >
            장소 저장
          </motion.button>
        </footer>
      </motion.form>
    </motion.div>
  );
}