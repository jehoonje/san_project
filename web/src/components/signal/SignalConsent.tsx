"use client";

import { useEffect, useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion, scrimMotion } from "@/lib/motion";
import styles from "./signal.module.css";

type Props = {
  callSign: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

// 처음 신호를 켤 때: 무엇이 누구에게 보이는지 먼저 알려줌
export function SignalConsent({ callSign, onConfirm, onCancel }: Props) {
  const reduce = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <motion.div
      className={styles.scrim}
      {...scrimMotion(reduce)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...dialogMotion(reduce, "bottom")}
      >
        <p className={styles.eyebrow}>SIGNAL</p>
        <h2 id={titleId} className={styles.callSign}>
          {callSign ?? "· · ·"}
        </h2>
        <p className={styles.cardTitle}>
          오늘의 신호명이에요. 근처를 걷는 사람과 서로 손을 흔들 수 있어요.
        </p>
        <div className={styles.body}>
          <ul>
            <li>반경 600m 안에서 신호를 켠 사람에게만 보여요.</li>
            <li>위치는 약 100m 단위로 흐리게 보이고, 이름이나 계정은 보이지 않아요.</li>
            <li>취향 이름과 모은 취향 몇 개가 함께 보여요.</li>
            <li>앱을 닫거나 신호를 끄면 바로 사라져요. 신호명은 매일 바뀌어요.</li>
          </ul>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onCancel}>
            다음에
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={onConfirm}
            autoFocus
          >
            신호 켜기
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}
