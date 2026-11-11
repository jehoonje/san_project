// web/src/hooks/useSimulatedWalk.ts
"use client";

import { useEffect, useRef } from "react";
import type { LngLat } from "@/lib/geo";
import type { TrackingStatus } from "@/types/tracking";

const STEP_MS = 1000;
const WALK_STEPS = 15;
const STAY_STEPS = 45;
const CYCLE = WALK_STEPS + STAY_STEPS;
const STEP_METERS = 6;
const JITTER_METERS = 6;

// 위도 1도 ≈ 111,320m
const M_PER_DEG_LAT = 111320;

/*
 * 데스크탑 브라우저 확인용 가짜 산책 (?sim=1).
 * 15초 걷고 45초 머무는 패턴을 반복하며 1초마다 좌표를 만든다.
 * 앱(WebView) 안에서는 실제 GPS를 쓰므로 enabled=false로 둔다.
 */
export function useSimulatedWalk(
  enabled: boolean,
  status: TrackingStatus,
  start: LngLat,
  onPoint: (point: LngLat) => void,
) {
  const stepRef = useRef(0);
  const posRef = useRef<LngLat | null>(null);
  const onPointRef = useRef(onPoint);

  useEffect(() => {
    onPointRef.current = onPoint;
  }, [onPoint]);

  useEffect(() => {
    if (!enabled) return;

    if (status === "idle") {
      stepRef.current = 0;
      posRef.current = null;
      return;
    }

    if (status !== "recording") return;

    const mPerDegLng =
      M_PER_DEG_LAT * Math.cos((start[1] * Math.PI) / 180);

    const timer = setInterval(() => {
      const step = stepRef.current++;
      const base = posRef.current ?? start;
      const phase = step % CYCLE;
      const leg = Math.floor(step / CYCLE);

      let next: LngLat;

      if (phase < WALK_STEPS) {
        // 구간마다 방향을 바꿔 가며 걷기 (동 → 북 → 서 → 남 ...)
        const angle = (leg % 4) * (Math.PI / 2) + 0.3;
        next = [
          base[0] + (Math.cos(angle) * STEP_METERS) / mPerDegLng,
          base[1] + (Math.sin(angle) * STEP_METERS) / M_PER_DEG_LAT,
        ];
        posRef.current = next;
      } else {
        // 머무는 동안은 GPS 흔들림처럼 기준점 주변에서 조금씩 움직임
        const jitter = () => (Math.random() * 2 - 1) * JITTER_METERS;
        next = [
          base[0] + jitter() / mPerDegLng,
          base[1] + jitter() / M_PER_DEG_LAT,
        ];
      }

      onPointRef.current(next);
    }, STEP_MS);

    return () => clearInterval(timer);
  }, [enabled, status, start]);
}
