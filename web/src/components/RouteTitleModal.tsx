"use client";

import { useEffect, useId, useRef, useState } from "react";

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
    <div
      className="fixed inset-0 z-[100] grid place-items-end bg-black/60 p-4 backdrop-blur-sm sm:place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-[28px] border border-white/[0.08] bg-[#0e1722] p-6 shadow-[0_24px_60px_rgba(0,0,0,.5)]"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00bfff]">Route</p>
        <h2 id={titleId} className="mt-1 text-2xl font-extrabold tracking-tight text-white">{heading}</h2>
        <p id={descriptionId} className="mt-1 text-sm text-[#8fa3b8]">{description}</p>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          disabled={isSaving}
          aria-label={heading}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? errorId : undefined}
          className="mt-5 h-14 w-full rounded-full border border-white/10 bg-[#0a121c] px-5 text-base text-white outline-none transition placeholder:text-[#5f7387] focus:border-[#00bfff]/60 focus:ring-4 focus:ring-[#00bfff]/15 disabled:opacity-60"
        />
        {errorMessage ? (
          <p id={errorId} role="alert" className="mt-2 px-2 text-sm text-[#ff9c8d]">{errorMessage}</p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} disabled={isSaving}
            className="h-14 rounded-full border border-white/10 bg-white/[0.05] font-bold text-white transition active:scale-[0.98] disabled:opacity-50">
            취소
          </button>
          <button type="submit" disabled={!trimmed || isSaving}
            className="h-14 rounded-full bg-[#00bfff] font-extrabold tracking-wide text-[#04121c] shadow-[0_10px_28px_rgba(0,191,255,.25)] transition active:scale-[0.98] disabled:opacity-40">
            {isSaving ? "저장 중…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}