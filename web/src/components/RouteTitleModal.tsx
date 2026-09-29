// web/src/components/RouteTitleModal.tsx
"use client";

import { useState } from "react";

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
  const trimmed = title.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || isSaving) return;
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-neutral-900">{heading}</h2>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          placeholder="예: 한강 저녁 산책"
          className="mt-4 w-full rounded-xl border border-neutral-200 px-4 py-3 text-[16px] text-neutral-900 outline-none focus:border-[#ff5a36]"
        />

        {errorMessage && (
          <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 rounded-xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-700 active:scale-95 transition disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!trimmed || isSaving}
            className="flex-1 rounded-xl bg-[#ff5a36] py-3 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}