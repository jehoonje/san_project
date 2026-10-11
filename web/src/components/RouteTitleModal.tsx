"use client";

import { useEffect, useId, useState } from "react";

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
  heading = "루트 제목",
  description = "저장할 루트의 이름을 입력해 주세요.",
  confirmLabel = "확인",
}: RouteTitleModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const trimmed = title.trim();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onCancel]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || isSaving) return;
    onConfirm(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-5 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${errorMessage ? ` ${errorId}` : ""}`}
        className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(29,33,38,.96),rgba(9,12,16,.98))] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl"
      >
        <div className="mb-5 h-px w-10 bg-white/25" aria-hidden="true" />

        <h2
          id={titleId}
          className="text-lg font-semibold tracking-[-0.02em] text-white"
        >
          {heading}
        </h2>
        <p
          id={descriptionId}
          className="mt-2 text-sm leading-6 text-neutral-400"
        >
          {description}
        </p>

        <label htmlFor={`${titleId}-input`} className="sr-only">
          루트 이름
        </label>
        <input
          id={`${titleId}-input`}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={40}
          placeholder="예: 한강 저녁 산책"
          aria-invalid={Boolean(errorMessage)}
          aria-errormessage={errorMessage ? errorId : undefined}
          className="mt-5 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white caret-[#79adff] outline-none transition placeholder:text-neutral-600 hover:border-white/20 focus:border-[#79adff]/70 focus:bg-white/[0.08] focus:ring-4 focus:ring-[#79adff]/10"
        />

        <div className="mt-2 flex min-h-5 items-start justify-between gap-4 px-1 text-xs">
          <p id={errorId} role="alert" className="text-[#ff8b78]">
            {errorMessage ?? ""}
          </p>
          <span className="shrink-0 tabular-nums text-neutral-600">
            {title.length}/40
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-neutral-300 transition hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!trimmed || isSaving}
            className="min-h-12 rounded-2xl bg-[#f4f5f7] px-4 py-3 text-sm font-semibold text-[#090c10] transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isSaving ? "저장 중…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}