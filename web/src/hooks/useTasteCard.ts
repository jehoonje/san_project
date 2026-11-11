"use client";

import { useEffect, useState } from "react";
import { buildCollection, buildTasteCard, type TasteCard } from "@/lib/tasteCollection";
import { fetchSnapshot } from "@/lib/tasteProfile";
import type { GiftPlace } from "@/lib/signal";

export type TasteCardState = {
  card: TasteCard;
  /** 교차했을 때 건넬 수 있는 장소 (많이 남긴 순) */
  gifts: GiftPlace[];
};

const EMPTY_CARD: TasteCard = { t: "아직 이름 없는 취향", k: [], n: 0 };

// 신호에 실어 보낼 내 취향 카드: 컬렉션과 같은 데이터를 나눠 씀
export function useTasteCard(accessToken: string | null, enabled: boolean) {
  const [state, setState] = useState<TasteCardState | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) return;
    let cancelled = false;

    fetchSnapshot(accessToken)
      .then((snap) => {
        if (cancelled) return;
        const collection = buildCollection(snap.stats);
        const gifts = [...(snap.stats.placeEvidence?.places ?? [])]
          .sort((a, b) => b.recordCount - a.recordCount)
          .slice(0, 4)
          .map((p) => ({ name: p.name, category: p.category, region: p.regionDong }));
        setState({ card: buildTasteCard(collection, snap.report?.title), gifts });
      })
      .catch(() => {
        // 취향을 못 불러와도 신호는 켤 수 있게 빈 카드로
        if (!cancelled) setState({ card: EMPTY_CARD, gifts: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled]);

  return state;
}
