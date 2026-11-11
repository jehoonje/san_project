"use client";

import { motion, useReducedMotion } from "motion/react";
import { dialogMotion } from "@/lib/motion";
import { distanceLabel } from "@/lib/signal";
import type { Peer, Relation } from "@/hooks/useSignal";
import styles from "./signal.module.css";

type Props = {
  peer: Peer;
  relation: Relation | undefined;
  onWave: () => void;
  onClose: () => void;
};

// 지도에서 고른 신호: 상대의 취향 이름과 나와의 일치도, 손 흔들기
export function PeerSheet({ peer, relation, onWave, onClose }: Props) {
  const reduce = useReducedMotion();
  const iWaved = relation?.iWaved ?? false;
  const theyWaved = relation?.theyWaved ?? false;
  const crossed = relation?.crossed ?? false;

  return (
    <motion.section
      className={`${styles.panel} ${styles.floating}`}
      aria-label={`${peer.cs} 신호`}
      {...dialogMotion(reduce, "bottom")}
    >
      <div className={styles.panelHead}>
        <p className={styles.eyebrow}>
          NEARBY SIGNAL <span className={styles.dim}>· {distanceLabel(peer.distance)}</span>
        </p>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <p className={styles.callSign}>{peer.cs}</p>
      <p className={styles.cardTitle}>{peer.card.t}</p>

      <p className={styles.matchRow}>
        <span className={styles.match}>취향 일치 {peer.match}%</span>
        {peer.common.length > 0 && (
          <span className={styles.common}>{peer.common.slice(0, 3).join(" · ")}</span>
        )}
      </p>

      <div className={styles.actions}>
        {crossed ? (
          <p className={`${styles.waiting} ${styles.wide}`}>교차한 신호예요 ✓</p>
        ) : iWaved ? (
          <p className={`${styles.waiting} ${styles.wide}`} role="status">
            <span className={styles.pulse} />
            손을 흔들었어요 · 응답을 기다리는 중
          </p>
        ) : (
          <button
            type="button"
            className={`${styles.primary} ${styles.wide}`}
            onClick={onWave}
          >
            {theyWaved ? "같이 손 흔들기" : "손 흔들기"}
          </button>
        )}
      </div>
    </motion.section>
  );
}
