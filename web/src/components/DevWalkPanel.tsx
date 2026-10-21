"use client";

import { useEffect, useState } from "react";

import type { DevDir } from "@/hooks/useDevWalk";

type Props = {
  auto: boolean;
  onAutoChange: (value: boolean) => void;
  onPress: (dir: DevDir, down: boolean) => void;
};

const STORAGE_KEY = "san-dev-walk-open";
const ALL_DIRS: DevDir[] = ["up", "down", "left", "right", "run"];

const BTN =
  "flex h-10 w-10 touch-none select-none items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white active:bg-[#ff6843]/70";

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

export function DevWalkPanel({ auto, onAutoChange, onPress }: Props) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "0") setOpen(false);
    } catch {
      /* 저장소 접근 불가 시 무시 */
    }
  }, []);

  function toggle() {
    const next = !open;

    // 접는 순간 눌려 있던 방향키 상태를 모두 해제 (버튼이 사라져 pointerup이 안 올 수 있음)
    if (!next) ALL_DIRS.forEach((dir) => onPress(dir, false));

    setOpen(next);

    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* 무시 */
    }
  }

  return (
    <div
      data-dev-walk
      className={`pointer-events-auto fixed left-3 z-[90] rounded-2xl border border-white/15 bg-black/70 text-[11px] text-white backdrop-blur-md ${
        open ? "p-2.5" : "p-1"
      }`}
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 80px)" }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "가상 이동 패널 접기" : "가상 이동 패널 펼치기"}
          className="relative flex h-8 min-w-8 touch-none select-none items-center justify-center rounded-lg border border-white/15 bg-white/10 px-1.5 text-[11px] font-semibold text-[#ff7959] active:bg-[#ff6843]/70"
        >
          {open ? "−" : "DEV"}

          {/* 접힌 상태에서도 자동 걷기가 켜져 있으면 표시 */}
          {!open && auto && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#ff6843] ring-2 ring-black/70" />
          )}
        </button>

        {open && <span className="font-semibold text-[#ff7959]">가상 이동</span>}
      </div>

      {open && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1">
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
              className={`${BTN} w-auto flex-1 px-2 ${
                auto ? "!bg-[#ff6843]/80" : ""
              }`}
              onClick={() => onAutoChange(!auto)}
            >
              자동 걷기 {auto ? "ON" : "OFF"}
            </button>
          </div>

          <div className="mt-2 text-white/60">WASD/방향키 · Shift 달리기</div>
        </>
      )}
    </div>
  );
}