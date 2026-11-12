"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion, scrimMotion } from "@/lib/motion";

type RouteTitleModalProps = {
  defaultTitle: string;
  isSaving: boolean;
  errorMessage: string | null;
  onConfirm: (title: string) => void;
  onCancel: () => void;
  heading?: string;
  description?: string;
  confirmLabel?: string;
};

export function RouteTitleModal({
  defaultTitle,
  isSaving,
  errorMessage,
  onConfirm,
  onCancel,
  heading = "루트 이름",
  description = "저장할 루트의 이름을 입력해 주세요.",
  confirmLabel = "저장",
}: RouteTitleModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const trimmed = title.trim();
  const reducedMotion = useReducedMotion();

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onCancelRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSaving]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || isSaving) return;
    onConfirm(trimmed);
  }

  return (
    <motion.div
      className="san-scrim-layer fixed inset-0 z-[100] grid place-items-end p-4 sm:place-items-center"
      {...scrimMotion(reducedMotion)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel();
      }}
    >
      <motion.form
        {...dialogMotion(reducedMotion, "bottom")}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-[28px] bg-san-bg p-6 text-san-text"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <p className="san-eyebrow">ROUTE</p>
        <h2 id={titleId} className="san-title mt-2 text-[22px]">
          {heading}
        </h2>
        <p id={descriptionId} className="mt-1.5 text-[13px] leading-relaxed text-san-text">
          {description}
        </p>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          disabled={isSaving}
          aria-label={heading}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? errorId : undefined}
          className="san-field-input mt-6"
        />
        {errorMessage ? (
          <p id={errorId} role="alert" className="mt-3 px-2 text-[13px] text-san-error">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="san-pill h-14"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!trimmed || isSaving}
            className="san-pill san-pill-fill h-14"
          >
            {isSaving ? "저장 중…" : confirmLabel}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
