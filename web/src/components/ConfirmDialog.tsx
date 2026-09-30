// web/src/components/ConfirmDialog.tsx
"use client";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  isBusy: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "삭제",
  isBusy,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        <p className="mt-1 break-words text-sm text-neutral-500">{message}</p>

        {errorMessage && (
          <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-700 active:scale-95 transition disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-50"
          >
            {isBusy ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}