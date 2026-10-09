"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import styles from "./TopBar.module.css";

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

const SPRING = { type: "spring", stiffness: 360, damping: 30 } as const;

function AnalysisIcon() {
  return (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 19V11" />
      <path d="M10 19V6" />
      <path d="M15 19v-4" />
      <path d="M20 19V3" />
    </svg>
  );
}

function MenuBackIcon({ isBack }: { isBack: boolean }) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : SPRING;

  return (
    <span className={styles.menuGlyph} aria-hidden="true">
      <motion.span
        className={styles.menuLine}
        animate={
          isBack
            ? { width: 12, x: 2, y: 0, rotate: -45 }
            : { width: 20, x: 0, y: -6, rotate: 0 }
        }
        transition={transition}
      />
      <motion.span
        className={styles.menuLine}
        animate={
          isBack
            ? { width: 18, x: 2, y: 0, rotate: 0 }
            : { width: 20, x: 0, y: 0, rotate: 0 }
        }
        transition={transition}
      />
      <motion.span
        className={styles.menuLine}
        animate={
          isBack
            ? { width: 12, x: 2, y: 0, rotate: 45 }
            : { width: 20, x: 0, y: 6, rotate: 0 }
        }
        transition={transition}
      />
    </span>
  );
}

export function TopBar({
  title,
  isBack,
  onMenu,
  onBack,
  rightAction = null,
}: TopBarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <header className={styles.root}>
      <motion.div
        className={styles.glass}
        initial={reduceMotion ? false : { opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <motion.button
          type="button"
          className={styles.iconButton}
          onClick={isBack ? onBack : onMenu}
          aria-label={isBack ? "뒤로가기" : "메뉴 열기"}
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
          transition={SPRING}
        >
          <MenuBackIcon isBack={isBack} />
        </motion.button>

        <div className={styles.titleSlot} aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={title}
              className={styles.title}
              initial={
                reduceMotion ? false : { opacity: 0, y: 5, filter: "blur(5px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduceMotion
                  ? undefined
                  : { opacity: 0, y: -4, filter: "blur(4px)" }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
              }
            >
              {title}
            </motion.h1>
          </AnimatePresence>
        </div>

        <div className={styles.actionSlot}>
          <AnimatePresence initial={false}>
            {rightAction && !isBack ? (
              <motion.button
                key="right-action"
                type="button"
                className={styles.iconButton}
                onClick={rightAction.onClick}
                aria-label={rightAction.label}
                title={rightAction.label}
                initial={
                  reduceMotion ? false : { opacity: 0, scale: 0.72, rotate: -8 }
                }
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.78 }}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                transition={SPRING}
              >
                <AnalysisIcon />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </header>
  );
}
