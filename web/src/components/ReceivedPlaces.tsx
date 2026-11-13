"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toastMotion } from "@/lib/motion";
import {
  listReceived,
  markOpened,
  onHandoversChange,
  type Handover,
} from "@/lib/handovers";

type ReceivedPlacesProps = {
  /** 건네받은 장소를 지도에서 보여줄 때 */
  onShow: (place: Handover) => void;
};

function stamp(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--.--";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 건네받은 장소.
 * 아직 열어 보지 않은 것이 있으면 지도 위에 조용히 한 줄로 떠오릅니다.
 */
export function ReceivedPlaces({ onShow }: ReceivedPlacesProps) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<Handover[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(() => {
    listReceived()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
    return onHandoversChange(load);
  }, [load]);

  const fresh = items.filter(
    (item) => !item.openedAt && !dismissed.includes(item.id),
  );
  const next = fresh[0] ?? null;

  async function open(item: Handover) {
    setDismissed((prev) => [...prev, item.id]);
    onShow(item);
    try {
      await markOpened(item.id);
    } catch (error) {
      console.error("건네받은 장소 열기 실패:", error);
    }
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[56] flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 84px)" }}
    >
      <AnimatePresence mode="wait">
        {next && (
          <motion.div
            key={next.id}
            className="san-veil pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full py-2 pl-5 pr-2"
            role="status"
            {...toastMotion(reduce)}
          >
            <span className="san-dot san-dot-star" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1 truncate text-[13px] text-san-text">
              <span className="mr-2">{next.fromName ?? "서클"}</span>
              {next.name}
              {fresh.length > 1 && (
                <span className="san-data ml-2">+{fresh.length - 1}</span>
              )}
            </p>
            <button
              type="button"
              className="san-pill san-pill-fill min-h-11 px-4 text-[13px]"
              onClick={() => void open(next)}
            >
              보기
            </button>
            <button
              type="button"
              className="san-icon-btn san-icon-btn-plain h-11 w-11"
              onClick={() => setDismissed((prev) => [...prev, next.id])}
              aria-label="나중에 보기"
            >
              <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 받은 장소 목록 (My Routes 아래) */
export function ReceivedList({ onShow }: ReceivedPlacesProps) {
  const [items, setItems] = useState<Handover[] | null>(null);

  const load = useCallback(() => {
    listReceived()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
    return onHandoversChange(load);
  }, [load]);

  if (!items || items.length === 0) return null;

  return (
    <section className="px-6 pb-2 pt-6" aria-label="건네받은 장소">
      <h3 className="san-eyebrow">HANDED TO ME</h3>
      <ul className="m-0 mt-2 list-none p-0">
        {items.slice(0, 8).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => void onShow(item)}
              className="flex min-h-11 w-full items-center gap-3 whitespace-nowrap rounded-[14px] border-0 bg-transparent px-2 text-left transition-colors duration-500 ease-ambient active:bg-san-surface"
            >
              <span className="san-data w-[5ch] shrink-0">{stamp(item.sentAt)}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-san-text">
                {item.name}
              </span>
              {item.note && (
                <span className="hidden min-w-0 max-w-[38%] truncate text-[12px] text-san-muted sm:inline">
                  {item.note}
                </span>
              )}
              <span className="shrink-0 text-[12px] text-san-muted">
                {item.fromName ?? ""}
              </span>
              {!item.openedAt && (
                <span className="san-dot san-dot-star shrink-0" aria-label="새로 받음" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
