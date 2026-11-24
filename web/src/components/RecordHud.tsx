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

/** 걷는 동안의 수치. 거리 하나만 크게 두고 나머지는 보조로. */
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

  return (
    <div className="san-hud">
      <AnimatePresence mode="wait" initial={false}>
        {active ? (
          <motion.div key="active" className="san-hud-body" {...screenMotion(reduce)}>
            <p className="san-t1 tabular-nums" aria-label={`걸은 거리 ${km}킬로미터`}>
              {km} km
            </p>
            <p className="san-t3 san-hud-meta">
              <span>{status === "recording" ? "기록 중" : "멈춤"}</span>
              <span aria-hidden="true">·</span>
              <span>{elapsed}</span>
              {placeCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>장소 {placeCount}</span>
                </>
              )}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
