"use client";

import type { DevDir } from "@/hooks/useDevWalk";

type Props = {
  auto: boolean;
  onAutoChange: (value: boolean) => void;
  onPress: (dir: DevDir, down: boolean) => void;
};

const BTN =
  "flex h-10 w-10 select-none items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white active:bg-[#ff6843]/70";

function Hold({
  dir,
  label,
  onPress,
}: {
  dir: DevDir;
  label: string;
  onPress: Props["onPress"];
}) {
  return (
    <button
      type="button"
      className={BTN}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(dir, true);
      }}
      onPointerUp={() => onPress(dir, false)}
      onPointerCancel={() => onPress(dir, false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={dir}
    >
      {label}
    </button>
  );
}

/** 로컬 개발용 가상 이동 패널 (isDevMockEnabled일 때만 렌더링) */
export function DevWalkPanel({ auto, onAutoChange, onPress }: Props) {
  return (
    <div
      className="pointer-events-auto absolute top-18 left-3 z-[60] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[11px] text-white backdrop-blur-md"
      data-dev-walk
    >
      <div className="mb-2 font-semibold text-[#ff7959]">DEV 가상 이동</div>
      <div className="grid grid-cols-3 gap-1">
        <span />
        <Hold dir="up" label="▲" onPress={onPress} />
        <span />
        <Hold dir="left" label="◀" onPress={onPress} />
        <Hold dir="down" label="▼" onPress={onPress} />
        <Hold dir="right" label="▶" onPress={onPress} />
      </div>
      <div className="mt-2 flex gap-1">
        <Hold dir="run" label="뛰기" onPress={onPress} />
        <button
          type="button"
          className={`${BTN} w-auto flex-1 px-2 ${auto ? "!bg-[#ff6843]/80" : ""}`}
          onClick={() => onAutoChange(!auto)}
        >
          자동 걷기 {auto ? "ON" : "OFF"}
        </button>
      </div>
      <div className="mt-2 text-white/60">WASD/방향키 · Shift 달리기</div>
    </div>
  );
}
