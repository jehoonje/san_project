"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toastMotion } from "@/lib/motion";
import type { SignalNotice } from "@/hooks/useSignal";
import styles from "./signal.module.css";

type Props = {
  notice: SignalNotice | null;
  onWaveBack: (sid: string) => void;
  onDismiss: (id: string) => void;
};

const CATEGORY_LABEL: Record<string, string> = {
  cafe: "카페",
  restaurant: "식당",
  bar: "술집",
  park: "공원",
  shop: "소품샵",
  culture: "문화",
  etc: "장소",
};

// 위쪽에 잠시 떠오르는 신호 알림 (손 흔듦 / 장소를 건넴)
export function SignalNoticeBanner({ notice, onWaveBack, onDismiss }: Props) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => onDismiss(notice.id),
      notice.kind === "wave" ? 15000 : 9000,
    );
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div className={styles.bannerWrap}>
      <AnimatePresence mode="wait">
        {notice && (
          <motion.div
            key={notice.id}
            className={styles.banner}
            role="status"
            aria-live="polite"
            {...toastMotion(reduce)}
          >
            <p className={styles.bannerText}>
              {notice.kind === "wave" ? (
                <>
                  <b>{notice.cs}</b> 님이 손을 흔들었어요
                  <small>취향 일치 {notice.match}%</small>
                </>
              ) : (
                <>
                  <b>{notice.cs}</b> 님이 장소를 건넸어요
                  <small>
                    {notice.place.name} · {CATEGORY_LABEL[notice.place.category] ?? "장소"}
                    {notice.place.region ? ` · ${notice.place.region}` : ""}
                  </small>
                </>
              )}
            </p>
            {notice.kind === "wave" && (
              <button
                type="button"
                className={styles.bannerAction}
                onClick={() => {
                  onWaveBack(notice.sid);
                  onDismiss(notice.id);
                }}
              >
                같이 흔들기
              </button>
            )}
            <button
              type="button"
              className={styles.bannerClose}
              onClick={() => onDismiss(notice.id)}
              aria-label="알림 닫기"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
