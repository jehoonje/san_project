"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_AMBIENT } from "@/lib/motion";

type TopBarProps = {
  title: string;
  isBack: boolean;
  onMenu: () => void;
  onBack: () => void;
  rightAction?: {
    label: string;
    onClick: () => void;
    /** 기본은 분석 아이콘 */
    icon?: "analysis" | "globe";
  } | null;
  // 카드형 ↔ 목록형 전환 토글 (분석 버튼 왼쪽)
  viewToggle?: {
    mode: "grid" | "log";
    onToggle: () => void;
  } | null;
};

function GridIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="4.5" width="6" height="6" rx="2" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="2" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="2" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="2" />
    </svg>
  );
}

// 목록형: 짧은 머리말 + 한 줄 텍스트가 이어지는 모양
function LogIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7h2.5M10 7h9.5M4.5 12h2.5M10 12h6.5M4.5 17h2.5M10 17h8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8.5h14M5 15.5h9" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 18-6-6 6-6" />
    </svg>
  );
}

// 지구본: 원 하나와 기울어진 궤도선
function GlobeIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M4.5 12h15M12 4.5c2.3 2.1 3.3 4.6 3.3 7.5s-1 5.4-3.3 7.5c-2.3-2.1-3.3-4.6-3.3-7.5s1-5.4 3.3-7.5Z" />
    </svg>
  );
}

// 기록의 잔향: 겹쳐 번지는 두 개의 타원
function AnalysisIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="8.5" ry="4.2" transform="rotate(-24 12 12)" />
      <ellipse cx="12" cy="12" rx="8.5" ry="4.2" transform="rotate(38 12 12)" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export function TopBar({
  title,
  isBack,
  onMenu,
  onBack,
  rightAction = null,
  viewToggle = null,
}: TopBarProps) {
  const reduce = useReducedMotion();
  // 오른쪽에 놓이는 버튼 수만큼 제목이 쓸 수 있는 너비가 줄어듭니다
  const rightSlots = (viewToggle ? 1 : 0) + 1;

  const swap = reduce
    ? { duration: 0 }
    : { duration: 0.36, ease: EASE_AMBIENT };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex min-h-[76px] items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        className="san-icon-btn pointer-events-auto"
        onClick={isBack ? onBack : onMenu}
        aria-label={isBack ? "뒤로 가기" : "메뉴 열기"}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isBack ? "back" : "menu"}
            className="grid place-items-center"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={swap}
          >
            {isBack ? <BackIcon /> : <MenuIcon />}
          </motion.span>
        </AnimatePresence>
      </button>

      <AnimatePresence mode="wait">
        <motion.p
          key={title}
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={swap}
          className="absolute left-1/2 m-0 flex -translate-x-1/2 items-center gap-2"
          style={{
            maxWidth: `calc(100vw - ${96 + rightSlots * 54}px)`,
          }}
        >
          <span className="san-eyebrow truncate">{title}</span>
        </motion.p>
      </AnimatePresence>

      <div className="flex items-center gap-1.5">
        {viewToggle && (
          <button
            type="button"
            className="san-icon-btn pointer-events-auto"
            onClick={viewToggle.onToggle}
            aria-label={
              viewToggle.mode === "grid" ? "목록형으로 보기" : "카드형으로 보기"
            }
            title={
              viewToggle.mode === "grid" ? "목록형으로 보기" : "카드형으로 보기"
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={viewToggle.mode}
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)" }}
                transition={swap}
                className="grid place-items-center"
              >
                {viewToggle.mode === "grid" ? <LogIcon /> : <GridIcon />}
              </motion.span>
            </AnimatePresence>
          </button>
        )}

        {rightAction ? (
          <button
            type="button"
            className="san-icon-btn pointer-events-auto"
            onClick={rightAction.onClick}
            aria-label={rightAction.label}
            title={rightAction.label}
          >
            {rightAction.icon === "globe" ? <GlobeIcon /> : <AnalysisIcon />}
          </button>
        ) : (
          <span className="h-12 w-12" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}
