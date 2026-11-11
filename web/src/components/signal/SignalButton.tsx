"use client";

import type { SignalStatus } from "@/hooks/useSignal";
import styles from "./signal.module.css";

type Props = {
  status: SignalStatus;
  count: number;
  onToggle: () => void;
};

function SignalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path
        d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  );
}

const LABEL: Record<SignalStatus, string> = {
  off: "근처 신호 켜기",
  connecting: "신호 연결 중 · 끄기",
  live: "신호 켜짐 · 끄기",
  error: "신호 연결 실패 · 끄기",
};

export function SignalButton({ status, count, onToggle }: Props) {
  return (
    <button
      type="button"
      className={styles.button}
      data-state={status}
      onClick={onToggle}
      aria-pressed={status !== "off"}
      aria-label={count > 0 ? `${LABEL[status]}, 근처 신호 ${count}개` : LABEL[status]}
      title={LABEL[status]}
    >
      <span className={styles.ripple} aria-hidden="true" />
      <span className={styles.ripple} aria-hidden="true" />
      <SignalIcon />
      {status !== "off" && count > 0 && (
        <span className={styles.count} aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}
