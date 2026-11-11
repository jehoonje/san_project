// web/src/components/DwellPrompt.tsx
"use client";

type DwellPromptProps = {
  minutes: number;
  onAccept: () => void;
  onDismiss: () => void;
};

// 한 곳에 오래 머물 때 지도 위에 띄우는 장소 저장 제안 카드
export function DwellPrompt({
  minutes,
  onAccept,
  onDismiss,
}: DwellPromptProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[50] flex justify-center px-5">
      <style>{`
        @keyframes dwellIn {
          from { transform: translateY(-12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div
        role="dialog"
        aria-label="머문 장소 저장 제안"
        className="pointer-events-auto w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5"
        style={{ animation: "dwellIn 0.25s ease-out both" }}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-2xl leading-none">📍</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              여기 들르셨나요?
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {minutes}분째 이 근처에 머무르고 있어요. 장소로
              저장할까요?
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700 transition active:scale-95"
          >
            아니요
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-xl bg-[#ff5a36] py-2.5 text-sm font-semibold text-white transition active:scale-95"
          >
            장소 저장
          </button>
        </div>
      </div>
    </div>
  );
}
