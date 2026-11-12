"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { screenMotion } from "@/lib/motion";
import type { TrackingStatus } from "@/types/tracking";

type RecordHudProps = {
  status: TrackingStatus;
  distanceMeters: number;
  startedAt: string | null;
  placeCount: number;
};

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * 오늘의 걸음: 큰 블러 원(감성) 위에 정밀한 모노스페이스 수치(데이터).
 * 기록 전에는 낮은 목소리의 한 줄만 둡니다.
 */
export function RecordHud({
  status,
  distanceMeters,
  startedAt,
  placeCount,
}: RecordHudProps) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const active = status !== "idle" && startedAt !== null;
  const km = (distanceMeters / 1000).toFixed(2);
  const elapsed = startedAt ? formatElapsed(now - new Date(startedAt).getTime()) : "00:00:00";
  const dots = Math.min(placeCount, 6);

  return (
    <div className="san-hud">
      <AnimatePresence mode="wait" initial={false}>
        {active ? (
          <motion.div
            key="active"
            className="relative grid w-full place-items-center"
            {...screenMotion(reduce)}
          >
            <span className="san-orb san-hud-orb" aria-hidden="true" />
            <span className="san-orbit-line san-hud-ring" aria-hidden="true" />

            <div className="san-hud-body">
              <p className="san-eyebrow flex items-center gap-2">
                <span
                  className={`san-dot ${status === "recording" ? "san-dot-live" : "san-dot-faint"}`}
                  aria-hidden="true"
                />
                {status === "recording" ? "REC" : "PAUSED"}
                <span aria-hidden="true">·</span>
                <span>{elapsed}</span>
              </p>

              <p className="san-hud-value m-0" aria-label={`걸은 거리 ${km}킬로미터`}>
                {km}
                <small>km</small>
              </p>

              <p className="san-hud-meta m-0">
                <span className="san-data">
                  {Math.round(distanceMeters).toLocaleString("ko-KR")} m
                </span>
                {dots > 0 && (
                  <span
                    className="flex items-center gap-1.5"
                    aria-label={`저장한 장소 ${placeCount}곳`}
                  >
                    {Array.from({ length: dots }, (_, i) => (
                      <span key={i} className="san-dot san-dot-star" />
                    ))}
                  </span>
                )}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
