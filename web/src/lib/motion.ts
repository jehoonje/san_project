// web/src/lib/motion.ts
// 모션 규칙: 튀지 않고 짧게. 나타날 때는 제자리 근처에서 떠오르고, 사라질 때는 빠르게.
// 흐림(blur)은 쓰지 않습니다. 움직임은 어디서 왔는지 알려 줄 때만 씁니다.
import type { Transition } from "motion/react";

// 감속이 긴 곡선: 처음엔 빠르게, 끝은 오래 머무르며 안착
export const EASE_AMBIENT = [0.22, 1, 0.36, 1] as const;
// 퇴장용: 머뭇거림 없이 사라짐
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

export const DURATION = {
  enter: 0.52,
  exit: 0.22,
  screen: 0.46,
} as const;

const instant: Transition = { duration: 0 };

// 배경(스크림): 단순 페이드
export function scrimMotion(reduced: boolean | null) {
  return {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: reduced ? instant : { duration: 0.36, ease: EASE_AMBIENT },
    },
    exit: {
      opacity: 0,
      transition: reduced ? instant : { duration: 0.24, ease: EASE_EXIT },
    },
  };
}

// 모달/시트 본체: 아래(또는 제자리)에서 살짝 떠오름
export function dialogMotion(
  reduced: boolean | null,
  from: "center" | "bottom" = "center",
) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: instant },
      exit: { opacity: 0, transition: instant },
    };
  }
  const y = from === "bottom" ? 28 : 14;
  return {
    initial: { opacity: 0, y },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: DURATION.enter, ease: EASE_AMBIENT },
    },
    exit: {
      opacity: 0,
      y: y / 2,
      transition: { duration: DURATION.exit, ease: EASE_EXIT },
    },
  };
}

// 화면(뷰) 교체: 제자리에서 바뀜
export function screenMotion(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: instant },
      exit: { opacity: 0, transition: instant },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: DURATION.screen, ease: EASE_AMBIENT },
    },
    exit: {
      opacity: 0,
      y: -4,
      transition: { duration: 0.2, ease: EASE_EXIT },
    },
  };
}

// 토스트: 아래에서 떠올랐다가 사라짐
export function toastMotion(reduced: boolean | null) {
  if (reduced) return screenMotion(reduced);
  return {
    initial: { opacity: 0, y: 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.42, ease: EASE_AMBIENT },
    },
    exit: {
      opacity: 0,
      y: 4,
      transition: { duration: 0.28, ease: EASE_EXIT },
    },
  };
}
