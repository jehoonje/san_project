"use client";

import type { TrackingStatus } from "@/types/tracking";

type TrackingControlsProps = {
  status: TrackingStatus;

  // 기존 page.tsx와의 호환성을 위해 타입만 유지합니다.
  // 화면에는 렌더링하지 않습니다.
  lastMessage?: string;

  onStart: () => void;
  onPause: () => void;
  onStop: () => void;

  showSavePlace?: boolean;
  placeCount?: number;
  onSavePlace?: () => void;
};

function PlayIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 5.5v13l10-6.5L8 5.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 5v14M16 5v14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
        fill="currentColor"
      />
    </svg>
  );
}

function PlaceIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="9"
        r="2.5"
        fill="currentColor"
      />
    </svg>
  );
}

export function TrackingControls({
  status,
  onStart,
  onPause,
  onStop,
  showSavePlace = false,
  placeCount = 0,
  onSavePlace,
}: TrackingControlsProps) {
  const isIdle = status === "idle";
  const isRecording = status === "recording";
  const isPaused = status === "paused";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4"
      style={{
        paddingBottom:
          "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-3 shadow-[0_10px_35px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        {!isIdle && (
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isRecording
                    ? "animate-pulse bg-red-500"
                    : "bg-amber-400"
                }`}
              />

              <span className="text-sm font-semibold text-neutral-800">
                {isRecording
                  ? "경로를 기록하고 있어요"
                  : "기록이 일시정지됐어요"}
              </span>
            </div>

            {placeCount > 0 && (
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                장소 {placeCount}개
              </span>
            )}
          </div>
        )}

        {isIdle && (
          <button
            type="button"
            onClick={onStart}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff5a36] py-3.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] active:bg-[#eb4d2c]"
          >
            <PlayIcon />
            기록 시작
          </button>
        )}

        {isRecording && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPause}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-100 py-3.5 text-sm font-semibold text-neutral-800 transition active:scale-[0.98] active:bg-neutral-200"
            >
              <PauseIcon />
              일시정지
            </button>

            <button
              type="button"
              onClick={onStop}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] active:bg-neutral-800"
            >
              <StopIcon />
              종료
            </button>
          </div>
        )}

        {isPaused && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onStart}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#ff5a36] py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] active:bg-[#eb4d2c]"
            >
              <PlayIcon />
              계속 기록
            </button>

            <button
              type="button"
              onClick={onStop}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] active:bg-neutral-800"
            >
              <StopIcon />
              종료
            </button>
          </div>
        )}

        {showSavePlace && onSavePlace && (
          <button
            type="button"
            onClick={onSavePlace}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ff5a36]/20 bg-[#fff4f0] py-3 text-sm font-semibold text-[#ff5a36] transition active:scale-[0.98] active:bg-[#ffe8e0]"
          >
            <PlaceIcon />
            현재 장소 저장

            {placeCount > 0 && (
              <span className="rounded-full bg-[#ff5a36] px-2 py-0.5 text-[11px] font-bold text-white">
                {placeCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}