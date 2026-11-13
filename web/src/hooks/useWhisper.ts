"use client";

import { useEffect, useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import { listRoutes, type RouteOwner } from "@/lib/routeStore";
import { pickWhisper, type Whisper } from "@/lib/whisper";
import type { SavedRoute } from "@/types/route";
import type { TrackingStatus } from "@/types/tracking";

/** 관찰을 살피는 간격 */
const CHECK_MS = 25_000;
/** 한 번 뜨면 이만큼은 조용히 */
const QUIET_MS = 4 * 60_000;
/** 화면에 머무는 시간 */
const SHOW_MS = 6_000;

type Options = {
  owner: RouteOwner | null;
  status: TrackingStatus;
  coords: LngLat[];
  distanceMeters: number;
  startedAt: string | null;
  /** 지금 지도에 보이는 행정동 */
  regionDong: string | null;
};

/**
 * 걷는 중 한 줄.
 * 지난 기록은 기록을 시작할 때 한 번만 읽고, 그 뒤로는 규칙만 돌립니다.
 */
export function useWhisper({
  owner,
  status,
  coords,
  distanceMeters,
  startedAt,
  regionDong,
}: Options) {
  const [whisper, setWhisper] = useState<Whisper | null>(null);
  const pastRef = useRef<SavedRoute[]>([]);
  const seenRef = useRef(new Set<string>());
  const quietUntilRef = useRef(0);
  const liveRef = useRef({ coords, distanceMeters, startedAt, regionDong });

  useEffect(() => {
    liveRef.current = { coords, distanceMeters, startedAt, regionDong };
  }, [coords, distanceMeters, startedAt, regionDong]);

  // 기록을 시작할 때 지난 기록을 한 번 읽어 둡니다
  useEffect(() => {
    if (status !== "recording" || !owner || pastRef.current.length > 0) return;
    let cancelled = false;
    listRoutes(owner)
      .then((routes) => {
        if (!cancelled) pastRef.current = routes;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // owner 는 식별 키로만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, owner?.kind === "user" ? owner.userId : "guest"]);

  // 기록이 끝나면 비웁니다
  useEffect(() => {
    if (status !== "idle") return;
    seenRef.current.clear();
    quietUntilRef.current = 0;
    setWhisper(null);
  }, [status]);

  useEffect(() => {
    if (status !== "recording") return;

    const tick = () => {
      const now = Date.now();
      if (now < quietUntilRef.current) return;

      const live = liveRef.current;
      const next = pickWhisper({
        coords: live.coords,
        distanceMeters: live.distanceMeters,
        startedAt: live.startedAt,
        regionDong: live.regionDong,
        past: pastRef.current,
        now: new Date(now),
      });

      if (!next || seenRef.current.has(next.key)) return;
      seenRef.current.add(next.key);
      quietUntilRef.current = now + QUIET_MS;
      setWhisper(next);
      window.setTimeout(() => setWhisper(null), SHOW_MS);
    };

    const timer = window.setInterval(tick, CHECK_MS);
    // 첫 관찰은 조금 걸은 뒤에
    const first = window.setTimeout(tick, 40_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [status]);

  return whisper;
}
