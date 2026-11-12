// web/src/components/DwellPrompt.tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { toastMotion } from "@/lib/motion";

type DwellPromptProps = {
  minutes: number;
  onAccept: () => void;
  onDismiss: () => void;
};

// 한 곳에 오래 머물 때 지도 위에 조용히 떠오르는 장소 저장 제안
export function DwellPrompt({ minutes, onAccept, onDismiss }: DwellPromptProps) {
  const reduce = useReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[50] flex justify-center px-5"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 84px)" }}
    >
      <motion.div
        role="dialog"
        aria-label="머문 장소 저장 제안"
        className="san-veil pointer-events-auto w-full max-w-sm rounded-[28px] p-5"
        {...toastMotion(reduce)}
      >
        <p className="san-eyebrow flex items-center gap-2">
          <span className="san-dot san-dot-star" aria-hidden="true" />
          STAY · {minutes} MIN
        </p>
        <p className="san-title mt-2">여기, 잠시 머무셨네요</p>
        <p className="mt-1 text-[13px] leading-relaxed text-san-text">
          이 자리를 장소로 남겨둘까요?
        </p>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onDismiss} className="san-pill flex-1">
            지나칠게요
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="san-pill san-pill-fill flex-1"
          >
            남기기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
