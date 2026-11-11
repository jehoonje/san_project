"use client";

import { useEffect, useState } from "react";
import {
  loadEncounters,
  onEncountersChange,
  type Encounter,
} from "@/lib/encounters";
import styles from "./signal.module.css";

type Props = { userId: string };

function shortDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--.--";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 컬렉션 아래: 스쳐 지나며 교차한 신호와 주고받은 장소
export function CrossingLog({ userId }: Props) {
  const [items, setItems] = useState<Encounter[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      loadEncounters(userId)
        .then((list) => {
          if (!cancelled) setItems(list);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    void load();
    const off = onEncountersChange(() => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, [userId]);

  return (
    <section className={styles.log} aria-label="교차한 신호">
      <p className={styles.eyebrow}>
        CROSSINGS{items && items.length > 0 ? ` · ${items.length}` : ""}
      </p>

      {items === null ? null : items.length === 0 ? (
        <p className={styles.logEmpty}>
          아직 스친 신호가 없어요. 지도에서 신호를 켜고 걸어보세요.
        </p>
      ) : (
        <ul className={styles.logList}>
          {items.slice(0, 20).map((item) => (
            <li key={item.id} className={styles.logItem}>
              <div className={styles.logLine}>
                <span className={styles.logCs}>{item.peerCallSign}</span>
                <span className={styles.logTitle}>{item.peerCard.t}</span>
                <span className={styles.logMeta}>
                  {item.match}% · {shortDate(item.metAt)}
                </span>
              </div>
              {(item.giftReceived || item.giftSent) && (
                <p className={styles.logGift}>
                  {item.giftReceived && (
                    <>
                      받음 <b>{item.giftReceived.name}</b>
                      {item.giftReceived.region ? ` · ${item.giftReceived.region}` : ""}
                    </>
                  )}
                  {item.giftReceived && item.giftSent && "   "}
                  {item.giftSent && (
                    <>
                      건넴 <b>{item.giftSent.name}</b>
                    </>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
