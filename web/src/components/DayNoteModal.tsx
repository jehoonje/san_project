"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion, scrimMotion } from "@/lib/motion";

type DayNoteModalProps = {
  day: string;
  /** 이미 적어 둔 한 줄 */
  initial?: string;
  onSave: (body: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
};

function dayLabel(day: string) {
  const d = new Date(`${day}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return day;
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${weekday}요일`;
}

/** 걷지 않은 날에도 한 줄은 남길 수 있게 */
export function DayNoteModal({
  day,
  initial = "",
  onSave,
  onDelete,
  onClose,
}: DayNoteModalProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const inputId = useId();
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const trimmed = body.trim();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function run(action: () => Promise<void> | void) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (error) {
      console.error("한 줄 저장 실패:", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="san-scrim-layer fixed inset-0 z-[84] grid place-items-end p-4 sm:place-items-center"
      {...scrimMotion(reduce)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) void run(() => onSave(trimmed));
        }}
        className="w-full max-w-md rounded-[28px] bg-san-bg p-6 text-san-text"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        {...dialogMotion(reduce, "bottom")}
      >
        <p className="san-eyebrow">REST DAY</p>
        <h2 id={titleId} className="san-title mt-2">
          {dayLabel(day)}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-san-text">
          걷지 않은 날에도 한 줄은 남을 수 있어요.
        </p>

        <label htmlFor={inputId} className="sr-only">
          오늘 한 줄
        </label>
        <input
          id={inputId}
          autoFocus
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={80}
          disabled={busy}
          placeholder="오늘은 어땠나요"
          className="san-field-input mt-6"
        />

        <div className="mt-6 grid grid-cols-2 gap-2">
          {initial && onDelete ? (
            <button
              type="button"
              onClick={() => void run(() => onDelete())}
              disabled={busy}
              className="san-pill san-pill-danger h-14"
            >
              지우기
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="san-pill h-14"
            >
              취소
            </button>
          )}
          <button
            type="submit"
            disabled={!trimmed || busy}
            className="san-pill san-pill-fill h-14"
          >
            {busy ? "남기는 중…" : "남기기"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
