"use client";

import {
  AnimatePresence,
  motion,
} from "motion/react";

type TopBarProps = {
  title: string;
  isBack: boolean;
  onMenu: () => void;
  onBack: () => void;
  rightAction?: {
    label: string;
    onClick: () => void;
  } | null;
};

function MenuIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 8h14M5 16h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnalysisIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 19V9M12 19V5M19 19v-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TopBar({
  title,
  isBack,
  onMenu,
  onBack,
  rightAction = null,
}: TopBarProps) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex min-h-[76px] items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
      <motion.button
        type="button"
        whileTap={{ scale: 0.91 }}
        transition={{
          type: "spring",
          stiffness: 480,
          damping: 30,
        }}
        className="pointer-events-auto grid h-12 w-12 place-items-center rounded-[18px] border border-white/15 bg-black/25 text-white shadow-[0_12px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl backdrop-saturate-150"
        onClick={isBack ? onBack : onMenu}
        aria-label={isBack ? "뒤로 가기" : "메뉴 열기"}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isBack ? "back" : "menu"}
            initial={{
              opacity: 0,
              rotate: isBack ? -25 : 25,
              scale: 0.8,
            }}
            animate={{
              opacity: 1,
              rotate: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              rotate: isBack ? 25 : -25,
              scale: 0.8,
            }}
            transition={{ duration: 0.2 }}
          >
            {isBack ? <BackIcon /> : <MenuIcon />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence mode="wait">
        <motion.p
          key={title}
          initial={{
            opacity: 0,
            y: -5,
            filter: "blur(5px)",
          }}
          animate={{
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
          }}
          exit={{
            opacity: 0,
            y: 5,
            filter: "blur(5px)",
          }}
          className="absolute left-1/2 max-w-[56vw] -translate-x-1/2 truncate text-[14px] font-semibold tracking-[-0.02em] text-white/84"
        >
          {title}
        </motion.p>
      </AnimatePresence>

      {rightAction ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.91 }}
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-[18px] border border-white/15 bg-black/25 text-white shadow-[0_12px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl backdrop-saturate-150"
          onClick={rightAction.onClick}
          aria-label={rightAction.label}
          title={rightAction.label}
        >
          <AnalysisIcon />
        </motion.button>
      ) : (
        <span className="h-12 w-12" aria-hidden="true" />
      )}
    </header>
  );
}