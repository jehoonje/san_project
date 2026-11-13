"use client";

import { motion, useReducedMotion } from "motion/react";
import { screenMotion } from "@/lib/motion";

type TodayNoteRowProps = {
  /** 오늘 이미 적어 둔 한 줄 (없으면 빈 문자열) */
  note: string;
  onOpen: () => void;
};

/**
 * 걷지 않은 날 한 줄.
 * 오늘 걸은 기록이 없을 때만 목록 맨 위에 조용히 한 줄 자리로 놓입니다.
 */
export function TodayNoteRow({ note, onOpen }: TodayNoteRowProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div className="px-6 pb-1 pt-5" {...screenMotion(reduce)}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-[22px] border-0 bg-transparent px-2 text-left transition-colors duration-500 ease-ambient active:bg-san-surface"
      >
        <span className="san-eyebrow shrink-0">TODAY</span>
        <span
          className={`min-w-0 flex-1 truncate text-[13.5px] ${
            note ? "text-san-text" : "text-san-muted"
          }`}
        >
          {note || "걷지 않은 날에도 한 줄은 남길 수 있어요"}
        </span>
        <svg
          className="san-icon shrink-0 text-san-muted"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M5 18.5h5M12.5 5.2a1.9 1.9 0 0 1 2.7 2.7L7.6 15.5l-3.1.8.8-3.1Z" />
        </svg>
      </button>
    </motion.div>
  );
}
