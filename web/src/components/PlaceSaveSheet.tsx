"use client";

import { useEffect, useId, useState } from "react";
import { motion, useDragControls, useReducedMotion } from "motion/react";
import { DURATION, EASE_AMBIENT, EASE_EXIT, scrimMotion } from "@/lib/motion";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/types/place";
import {
  useNearbyPlaces,
  type NearbyPlaceCandidate,
} from "@/hooks/useNearbyPlaces";
import { WheelPicker, type WheelOption } from "@/components/WheelPicker";

export type PlaceSheetState =
  | { status: "locating" }
  | {
      status: "ready";
      lat: number;
      lng: number;
      accuracy: number | null;
      // 체류 감지로 연 경우: 머문 구간 정보
      dwell?: { clusterId: number; startedAt: number; minutes: number };
    }
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

const CATEGORY_OPTIONS: readonly WheelOption<PlaceCategory>[] =
  PLACE_CATEGORIES.map((item) => ({ value: item.key, label: item.label }));

function CloseIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12.5 4 4 8-9" />
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
  // 휠은 늘 한 줄을 가리키므로, 중립적인 "기타"에서 시작
  const [category, setCategory] = useState<PlaceCategory>("etc");
  const dragControls = useDragControls();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nearby = useNearbyPlaces(
    state.status === "ready" ? state.lat : null,
    state.status === "ready" ? state.lng : null,
  );

  const trimmed = name.trim();
  const canSave = state.status === "ready" && trimmed.length > 0;
  const dwell = state.status === "ready" ? (state.dwell ?? null) : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
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

  return (
    <motion.div
      className="san-scrim-layer fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      {...scrimMotion(reducedMotion)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="san-sheet relative flex max-h-[min(90dvh,780px)] w-full max-w-none flex-col overflow-hidden sm:max-w-[480px] sm:rounded-[28px]"
        initial={
          reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, y: 48, filter: "blur(12px)" }
        }
        animate={{
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          transition: reducedMotion
            ? { duration: 0 }
            : { duration: DURATION.enter + 0.06, ease: EASE_AMBIENT },
        }}
        exit={
          reducedMotion
            ? { opacity: 0, transition: { duration: 0 } }
            : {
                opacity: 0,
                y: 28,
                filter: "blur(8px)",
                transition: { duration: 0.26, ease: EASE_EXIT },
              }
        }
        drag={reducedMotion ? false : "y"}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.35 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 850) onCancel();
        }}
      >
        {/* 손잡이와 머리말을 잡고 내리면 닫힘 (휠 스크롤과 겹치지 않게) */}
        <div
          className="touch-none"
          onPointerDown={(event) => dragControls.start(event)}
        >
          <div className="pb-1 pt-3" aria-hidden="true">
            <span className="san-grabber" />
          </div>

          <header className="flex items-start justify-between px-6 pb-5 pt-3">
            <div>
              <p className="san-eyebrow flex items-center gap-2">
                <span className="san-dot san-dot-star" aria-hidden="true" />
                {dwell ? `STAY · ${dwell.minutes} MIN` : "PLACE"}
              </p>
              <h2 id={titleId} className="san-title mt-2 text-[22px]">
                장소 저장
              </h2>
            </div>

            <button
              type="button"
              onClick={onCancel}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label="장소 저장 닫기"
              className="san-icon-btn san-icon-btn-plain -mr-2 -mt-1"
            >
              <CloseIcon />
            </button>
          </header>
        </div>

        <div className="san-no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-6">
          <section
            aria-label="위치 상태"
            className={`flex items-center gap-3 ${state.status === "ready" ? "" : "min-h-11"}`}
          >
            {state.status === "locating" && (
              <>
                <span className="san-dot san-dot-live" aria-hidden="true" />
                <p className="m-0 text-[13px] text-san-text">
                  위치 확인 중
                </p>
              </>
            )}

            {state.status === "error" && (
              <>
                <span className="san-dot bg-san-error" aria-hidden="true" />
                <p className="m-0 min-w-0 flex-1 truncate text-[13px] text-san-error">
                  {state.message}
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="san-pill min-h-11 px-4 text-[13px]"
                >
                  다시 찾기
                </button>
              </>
            )}
          </section>

          {state.status === "ready" && nearby.status === "loading" && (
            <div
              className="mt-6 flex items-center gap-4"
              role="status"
              aria-label="주변 장소 검색 중"
            >
              <span className="san-ripples" style={{ ["--size" as string]: "40px" }}>
                <i />
                <i />
                <i />
              </span>
              <p className="m-0 text-[13px] text-san-text">주변 장소 검색 중</p>
            </div>
          )}

          {nearby.status === "done" && nearby.places.length > 0 && (
            <section className="mt-6" aria-labelledby={`${titleId}-nearby`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 id={`${titleId}-nearby`} className="san-eyebrow">
                  NEARBY
                </h3>
                <span className="san-data">200 m</span>
              </div>

              {/* 구분선 없이 넉넉한 행 간격으로만 */}
              <ul className="m-0 list-none space-y-1 p-0">
                {nearby.places.slice(0, 4).map((place) => {
                  const selected = selectedId === place.providerId;

                  return (
                    <li key={place.providerId}>
                      <button
                        type="button"
                        onClick={() => handlePickCandidate(place)}
                        aria-pressed={selected}
                        className={`flex min-h-[56px] w-full items-center gap-3 rounded-[22px] border-0 px-4 text-left transition-colors duration-500 ease-ambient ${
                          selected ? "bg-san-surface" : "bg-transparent"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-san-text">
                            {place.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-san-text opacity-80">
                            {place.categoryName.split(" > ").slice(-1)[0]}
                          </span>
                        </span>

                        <span className="san-data shrink-0">
                          {place.distanceMeters} m
                        </span>

                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center text-san-text transition-opacity duration-300 ${
                            selected ? "opacity-100" : "opacity-0"
                          }`}
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
            <p className="mt-6 text-[13px] leading-relaxed text-san-text">
              주변 장소가 없어요. 이름을 직접 입력해 주세요.
            </p>
          )}

          {nearby.status === "error" && (
            <p className="mt-6 text-[13px] leading-relaxed text-san-text">
              주변 장소를 불러오지 못했어요. 이름을 직접 입력해 주세요.
            </p>
          )}

          <div className="mt-6">
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
              className="san-field-input"
            />
          </div>

          <fieldset className="m-0 mt-7 min-w-0 border-0 p-0">
            <legend className="san-eyebrow mb-3 p-0">CATEGORY</legend>
            <WheelPicker
              label="장소 카테고리"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              rows={3}
            />
          </fieldset>
        </div>

        <footer className="px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-2">
          <button
            type="submit"
            disabled={!canSave}
            className="san-pill san-pill-fill h-14 w-full text-[15px]"
          >
            저장
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}
