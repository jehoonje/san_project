"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setMockCurrent } from "@/lib/devLocation";

export type DevDir = "up" | "down" | "left" | "right" | "run";

type Options = {
  enabled: boolean;
  getCurrent: () => [number, number] | null;
  getStart: () => [number, number];
  getMapBearing: () => number;
  onMove: (coord: [number, number], headingDeg: number) => void;
};

const WALK_MPS = 1.4;
const RUN_MPS = 4.2;
const AUTO_RADIUS_M = 70;

const KEY_MAP: Record<string, DevDir> = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  Shift: "run",
};

function offset(
  [lng, lat]: [number, number],
  meters: number,
  bearingDeg: number,
): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(b)) / 111320;
  const dLng =
    (meters * Math.sin(b)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
}

/** 키보드(WASD/방향키) · 화면 버튼 · 자동 걷기로 가상 이동을 만들어 줍니다. */
export function useDevWalk({
  enabled,
  getCurrent,
  getStart,
  getMapBearing,
  onMove,
}: Options) {
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const pressed = useRef(new Set<DevDir>());
  const posRef = useRef<[number, number] | null>(null);
  const headingRef = useRef(0);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  const press = useCallback((dir: DevDir, down: boolean) => {
    if (down) pressed.current.add(dir);
    else pressed.current.delete(dir);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable);

    const down = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key];
      if (!dir || isTyping(e.target)) return;
      e.preventDefault();
      pressed.current.add(dir);
    };
    const up = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key];
      if (dir) pressed.current.delete(dir);
    };
    const blur = () => pressed.current.clear();

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const p = pressed.current;
      const x = (p.has("right") ? 1 : 0) - (p.has("left") ? 1 : 0);
      const y = (p.has("up") ? 1 : 0) - (p.has("down") ? 1 : 0);
      const speed = p.has("run") ? RUN_MPS : WALK_MPS;

      let heading: number | null = null;
      let meters = 0;

      if (x !== 0 || y !== 0) {
        heading =
          (getMapBearing() + (Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
        meters = speed * dt;
      } else if (autoRef.current) {
        headingRef.current =
          (headingRef.current +
            (((speed / AUTO_RADIUS_M) * 180) / Math.PI) * dt) %
          360;
        heading = headingRef.current;
        meters = speed * dt;
      }

      if (heading === null) return;

      if (!posRef.current) posRef.current = getCurrent() ?? getStart();
      posRef.current = offset(posRef.current, meters, heading);
      headingRef.current = heading;

      setMockCurrent(posRef.current);
      onMove(posRef.current, heading);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      pressed.current.clear();
    };
  }, [enabled, getCurrent, getStart, getMapBearing, onMove]);

  return { auto, setAuto, press };
}