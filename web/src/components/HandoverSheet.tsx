"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion, scrimMotion } from "@/lib/motion";
import { Avatar } from "@/components/Avatar";
import { sendHandover, type HandoverDraft } from "@/lib/handovers";
import type { CircleMember } from "@/lib/circles";
import type { PlaceCategory } from "@/types/place";

export type HandoverTarget = {
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  regionDong: string | null;
};

type HandoverSheetProps = {
  place: HandoverTarget;
  mates: CircleMember[];
  onDone: (message: string) => void;
  onClose: () => void;
};

/** 내가 남긴 장소를 같은 서클의 상대에게 건넵니다. */
export function HandoverSheet({ place, mates, onDone, onClose }: HandoverSheetProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const noteId = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(userId: string) {
    setPicked((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function send() {
    if (busy || picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const draft: Omit<HandoverDraft, "toUser"> = {
        name: place.name,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        regionDong: place.regionDong,
        note: note.trim() || null,
      };
      await Promise.all(
        picked.map((toUser) => sendHandover({ ...draft, toUser })),
      );
      onDone(
        picked.length === 1 ? "장소를 건넸어요." : `${picked.length}명에게 건넸어요.`,
      );
      onClose();
    } catch (sendError) {
      console.error("장소 건네기 실패:", sendError);
      setError("건네지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <motion.div
      className="san-scrim-layer fixed inset-0 z-[82] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      {...scrimMotion(reduce)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="san-sheet san-no-scrollbar flex max-h-[min(88dvh,700px)] w-full max-w-none flex-col overflow-y-auto px-6 pt-3 sm:max-w-[480px] sm:rounded-[28px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        {...dialogMotion(reduce, "bottom")}
      >
        <span aria-hidden="true" className="san-grabber mb-4" />

        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="san-eyebrow flex items-center gap-2">
              <span className="san-dot san-dot-star" aria-hidden="true" />
              HAND OVER
            </p>
            <h2 id={titleId} className="san-title mt-2 truncate">
              {place.name}
            </h2>
            {place.regionDong && (
              <p className="m-0 mt-0.5 text-[12.5px] text-san-muted">
                {place.regionDong}
              </p>
            )}
          </div>
          <button
            type="button"
            className="san-icon-btn san-icon-btn-plain -mr-2 -mt-1"
            onClick={onClose}
            aria-label="닫기"
          >
            <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </header>

        {mates.length === 0 ? (
          <p className="pb-4 text-[13px] leading-relaxed text-san-text">
            아직 함께 걷는 사람이 없어요. 계정 메뉴에서 서클을 만들면 장소를 건넬
            수 있어요.
          </p>
        ) : (
          <>
            <h3 className="san-eyebrow">TO</h3>
            <ul className="m-0 mt-3 list-none space-y-1 p-0">
              {mates.map((mate) => {
                const on = picked.includes(mate.userId);
                return (
                  <li key={mate.userId}>
                    <button
                      type="button"
                      onClick={() => toggle(mate.userId)}
                      aria-pressed={on}
                      className={`flex min-h-[56px] w-full items-center gap-3 rounded-[22px] border-0 px-4 text-left transition-colors duration-500 ease-ambient ${
                        on ? "bg-san-surface" : "bg-transparent"
                      }`}
                    >
                      <span className="shrink-0 overflow-hidden rounded-full">
                        <Avatar
                          url={mate.avatarUrl}
                          name={mate.displayName}
                          size={32}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-san-text">
                        {mate.displayName}
                      </span>
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center text-san-text transition-opacity duration-300 ${
                          on ? "opacity-100" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      >
                        <svg className="san-icon" viewBox="0 0 24 24">
                          <path d="m6 12.5 4 4 8-9" />
                        </svg>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6">
              <label htmlFor={noteId} className="san-eyebrow">
                NOTE
              </label>
              <input
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={80}
                placeholder="한 줄 덧붙이기 (선택)"
                className="san-field-input mt-3"
              />
            </div>

            {error && (
              <p role="alert" className="mt-3 text-[13px] text-san-error">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || picked.length === 0}
              className="san-pill san-pill-fill mt-6 h-14 w-full"
            >
              {busy ? "건네는 중…" : "건네기"}
            </button>
          </>
        )}
      </motion.section>
    </motion.div>,
    document.body,
  );
}
