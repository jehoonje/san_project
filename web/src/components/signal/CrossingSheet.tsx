"use client";

import { useEffect, useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion, EASE_AMBIENT, scrimMotion } from "@/lib/motion";
import type { GiftPlace } from "@/lib/signal";
import type { Crossing } from "@/hooks/useSignal";
import styles from "./signal.module.css";

type Props = {
  crossing: Crossing;
  myCallSign: string | null;
  giftSent: GiftPlace | null;
  giftReceived: GiftPlace | null;
  giftOptions: GiftPlace[];
  onGift: (place: GiftPlace) => void;
  onClose: () => void;
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

// 서로 손을 흔든 순간: 두 신호가 만나고, 아끼는 장소 하나를 건넬 수 있음
export function CrossingSheet({
  crossing,
  myCallSign,
  giftSent,
  giftReceived,
  giftOptions,
  onGift,
  onClose,
}: Props) {
  const reduce = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const orb = (from: number, to: number) =>
    reduce
      ? { style: { left: to } }
      : {
          initial: { left: from, opacity: 0 },
          animate: { left: to, opacity: 1 },
          transition: { duration: 1.4, ease: EASE_AMBIENT, delay: 0.15 },
        };

  return (
    <motion.div
      className={styles.scrim}
      {...scrimMotion(reduce)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...dialogMotion(reduce, "bottom")}
      >
        <div className={styles.crossing}>
          <p id={titleId} className={styles.eyebrow}>
            CROSSING
          </p>

          <div className={styles.meet} aria-hidden="true">
            <motion.span
              className={styles.meetLine}
              initial={reduce ? false : { opacity: 0, scaleX: 0.2 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 1.2, ease: EASE_AMBIENT }}
            />
            <motion.span className={styles.meetOrb} {...orb(0, 72)} />
            <motion.span className={styles.meetOrb} {...orb(206, 134)} />
          </div>
          <div className={styles.meetLabels}>
            <span>{myCallSign ?? "ME"}</span>
            <span>{crossing.cs}</span>
          </div>

          <p className={styles.bigMatch}>
            {crossing.match}
            <span>%</span>
          </p>
          <p className={styles.matchRow} style={{ marginTop: 2, justifyContent: "center" }}>
            <span className={styles.match}>취향 일치</span>
            {crossing.common.length > 0 && (
              <span className={styles.common}>{crossing.common.slice(0, 3).join(" · ")}</span>
            )}
          </p>
          <p className={styles.cardTitle}>“{crossing.card.t}”</p>
        </div>

        {giftReceived && (
          <motion.div
            className={styles.received}
            role="status"
            initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: EASE_AMBIENT }}
          >
            <p className={styles.eyebrow}>RECEIVED</p>
            <p className={styles.receivedName}>{giftReceived.name}</p>
            <p className={styles.dim}>
              {CATEGORY_LABEL[giftReceived.category] ?? "장소"}
              {giftReceived.region ? ` · ${giftReceived.region}` : ""} · {crossing.cs} 님이 건넨 장소
            </p>
          </motion.div>
        )}

        {giftSent ? (
          <p className={styles.sent} role="status">
            {giftSent.name} 을(를) 건넸어요 ✓
          </p>
        ) : giftOptions.length > 0 ? (
          <>
            <p className={styles.body} style={{ marginTop: 20 }}>
              아끼는 장소 하나를 건네볼까요?
            </p>
            <ul className={styles.giftList}>
              {giftOptions.map((place) => (
                <li key={`${place.name}-${place.region ?? ""}`}>
                  <button
                    type="button"
                    className={styles.giftItem}
                    onClick={() => onGift(place)}
                  >
                    <span>{place.name}</span>
                    <span>
                      {CATEGORY_LABEL[place.category] ?? "장소"}
                      {place.region ? ` · ${place.region}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.secondary} ${styles.wide}`}
            onClick={onClose}
          >
            {giftSent ? "닫기" : "다음에"}
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}
