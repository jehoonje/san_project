"use client";

import { useEffect, useState } from "react";
import {
  loadEncounters,
  onEncountersChange,
  type Encounter,
} from "@/lib/encounters";
import { emoteInfo } from "@/lib/signal";

type Props = {
  ownerId: string;
  /** 로그인 사용자면 서버 기록도 함께 읽음 */
  remote: boolean;
};

function stamp(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--.-- --:--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 교차 로그: 서로 인사를 나누며 스친 산책자. 한 줄 텍스트로만 남깁니다.
export function CrossingLog({ ownerId, remote }: Props) {
  const [items, setItems] = useState<Encounter[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      loadEncounters(ownerId, remote)
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
  }, [ownerId, remote]);

  return (
    <section aria-label="교차 로그">
      <p className="san-eyebrow flex items-center gap-2">
        CROSSINGS
        {items && items.length > 0 && (
          <span className="san-dot san-dot-star" aria-label={`${items.length}번`} />
        )}
      </p>

      {items === null ? null : items.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-san-text">
          아직 스친 사람이 없어요.
        </p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {items.slice(0, 12).map((item) => (
            <li
              key={item.id}
              className="flex min-h-11 items-center gap-3 whitespace-nowrap"
            >
              <span className="san-data w-[11ch] shrink-0">{stamp(item.metAt)}</span>
              <span className="san-data shrink-0 font-medium">{item.peerCallSign}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-san-text">
                {emoteInfo(item.myEmote).label} ↔ {emoteInfo(item.peerEmote).label}
              </span>
              {item.region && (
                <span className="shrink-0 text-[12px] text-san-muted">
                  {item.region}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
