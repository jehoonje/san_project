"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  LiquidGlassLayer,
  NAV_GLASS,
  supportsSvgBackdrop,
  type GlassConfig,
} from "./LiquidGlassLayer";

export type GlassTabItem<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
};

type GlassTabBarProps<T extends string> = {
  items: GlassTabItem<T>[];
  value: T;
  onSelect: (id: T) => void;
  reducedMotion?: boolean;
};

type Metric = { left: number; width: number };
type Controls = ReturnType<typeof animate>;

const DRAG_THRESHOLD = 10;
const OVERSHOOT = 22;
const PRESS_SCALE = 1.5;
const CONTAINER_SCALE = 1.05; // 돋보기 확대 때 컨테이너가 커지는 최대 배율
const LENS_HOLD_MS = 500;
const UNMOUNT_SCALE = 1.01;
const UNMOUNT_SAFETY_MS = 1500;
const PAD = 6; // p-1.5

// 트윈: 목표값을 넘지 않으므로 진동이 생기지 않습니다.
const MOVE_TWEEN = {
  type: "tween" as const,
  duration: 0.26,
  ease: [0.2, 0.9, 0.22, 1] as [number, number, number, number],
};
const SCALE_IN = {
  type: "tween" as const,
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};
const SCALE_OUT = {
  type: "tween" as const,
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

const LENS_GLASS: GlassConfig = { ...NAV_GLASS, blur: 0 };
const LENS_FALLBACK_FILTER = "saturate(160%)";

const ITEM_CLASS =
  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-full";

// 돋보기가 덮는 가로 구간만 원본을 숨기는 마스크
const LENS_MASK =
  "linear-gradient(to right, #000 0px, #000 var(--lens-l), rgba(0,0,0,var(--lens-hide)) var(--lens-l), rgba(0,0,0,var(--lens-hide)) var(--lens-r), #000 var(--lens-r), #000 100%)";

export function GlassTabBar<T extends string>({
  items,
  value,
  onSelect,
  reducedMotion = false,
}: GlassTabBarProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ready = useRef(false);
  const lastX = useRef<number | null>(null);
  const lastW = useRef<number | null>(null);
  const xCtl = useRef<Controls | null>(null);
  const wCtl = useRef<Controls | null>(null);
  const sCtl = useRef<Controls | null>(null);

  const [real, setReal] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pressed, setPressed] = useState(false);
  const [lensMounted, setLensMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const x = useMotionValue(0);
  const width = useMotionValue(0);
  const scale = useMotionValue(1);
  const innerX = useTransform(x, (v) => -v);

  // 확대 진행도(0~1): 반투명판/복사본/원본 가림/컨테이너 확대가 모두 이 값 하나로 연동됩니다.
  const progress = useTransform(scale, [1, PRESS_SCALE], [0, 1]);
  const baseOpacity = useTransform(progress, (v) => 1 - v);
  const containerScale = useTransform(progress, [0, 1], [1, CONTAINER_SCALE]);

  // 돋보기가 덮는 가로 구간 (스케일 반영)
  const lensL = useTransform(
    [x, width, scale],
    ([xv, wv, sv]: number[]) => `${xv + wv / 2 - (wv * sv) / 2}px`,
  );
  const lensR = useTransform(
    [x, width, scale],
    ([xv, wv, sv]: number[]) => `${xv + wv / 2 + (wv * sv) / 2}px`,
  );

  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === value),
  );

  const live = useRef({ items, value, onSelect, metrics });
  live.current = { items, value, onSelect, metrics };

  useEffect(() => {
    setReal(supportsSvgBackdrop());
    return () => {
      clearTimeout(holdTimer.current);
      clearTimeout(unmountTimer.current);
      xCtl.current?.stop();
      wCtl.current?.stop();
      sCtl.current?.stop();
    };
  }, []);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    setMetrics(
      btnRefs.current.map((b) => ({
        left: b?.offsetLeft ?? 0,
        width: b?.offsetWidth ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  // 컨테이너가 커진 상태에서도 레이아웃 좌표로 변환
  function localX(clientX: number) {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const sx = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    return (clientX - rect.left) / sx - el.clientLeft;
  }

  function nearestIndex(px: number) {
    let best = 0;
    let bestD = Infinity;
    live.current.metrics.forEach((m, i) => {
      const d = Math.abs(px - (m.left + m.width / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function handlePointerDown(idx: number, e: React.PointerEvent) {
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    clearTimeout(holdTimer.current);

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    // 누른 지점과 알약 왼쪽 끝의 차이: 드래그 시작 때 알약이 튀지 않도록 유지
    const grab = localX(startX) - (live.current.metrics[idx]?.left ?? 0);
    let moved = false;
    let current = idx;

    setPressed(true);
    setTarget(idx);

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      if (
        !moved &&
        (Math.abs(ev.clientX - startX) > DRAG_THRESHOLD ||
          Math.abs(ev.clientY - startY) > DRAG_THRESHOLD)
      ) {
        moved = true;
        setDragging(true);
      }
      if (!moved) return;

      const px = localX(ev.clientX);
      const w = live.current.metrics[idx]?.width ?? 0;
      const max = (containerRef.current?.clientWidth ?? 0) - w + OVERSHOOT;
      setDragX(Math.min(max, Math.max(-OVERSHOOT, px - grab)));

      current = nearestIndex(px);
      setTarget(current);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      setDragging(false);
      setDragX(null);
      setTarget(null);
      // 손을 뗀 뒤에도 잠시 돋보기를 유지
      holdTimer.current = setTimeout(() => setPressed(false), LENS_HOLD_MS);
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const next = live.current.items[current];
      cleanup();
      if (next && next.id !== live.current.value) live.current.onSelect(next.id);
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  const displayIndex = target ?? activeIndex;
  const metric = metrics[dragX !== null ? activeIndex : displayIndex];
  const hasMetric = Boolean(metric);
  const indicatorX = dragX ?? metric?.left ?? 0;
  const indicatorW = metric?.width ?? 0;
  const lens = pressed && !reducedMotion;

  // 목표값이 실제로 바뀔 때만 갱신 (확대 중 재시작 방지)
  useEffect(() => {
    if (!hasMetric) return;

    if (lastX.current === null || Math.abs(indicatorX - lastX.current) > 0.01) {
      xCtl.current?.stop();
      if (!ready.current || reducedMotion || dragging) {
        x.set(indicatorX);
      } else {
        xCtl.current = animate(x, indicatorX, MOVE_TWEEN);
      }
      lastX.current = indicatorX;
    }

    if (lastW.current === null || Math.abs(indicatorW - lastW.current) > 0.01) {
      wCtl.current?.stop();
      if (!ready.current || reducedMotion) {
        width.set(indicatorW);
      } else {
        wCtl.current = animate(width, indicatorW, MOVE_TWEEN);
      }
      lastW.current = indicatorW;
    }

    ready.current = true;
  }, [indicatorX, indicatorW, dragging, reducedMotion, hasMetric, x, width]);

  useEffect(() => {
    const next = lens ? PRESS_SCALE : 1;
    sCtl.current?.stop();
    if (reducedMotion) {
      scale.set(next);
      return;
    }
    // 알약이 아직 이동해야 하면 이동이 끝난 뒤 확대 시작 (중심이 고정된 상태에서 확대)
    const moving = lens && Math.abs(x.get() - indicatorX) > 1;
    sCtl.current = animate(scale, next, {
      ...(lens ? SCALE_IN : SCALE_OUT),
      delay: moving ? MOVE_TWEEN.duration * 0.85 : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, reducedMotion, scale]);

  // 진행도가 0에 도달(이미 투명)하면 레이어만 정리
  useEffect(() => {
    if (lens) {
      clearTimeout(unmountTimer.current);
      setLensMounted(true);
      return;
    }
    if (reducedMotion) {
      setLensMounted(false);
      return;
    }
    const stop = scale.on("change", (v) => {
      if (v <= UNMOUNT_SCALE) setLensMounted(false);
    });
    unmountTimer.current = setTimeout(
      () => setLensMounted(false),
      UNMOUNT_SAFETY_MS,
    );
    return () => {
      stop();
      clearTimeout(unmountTimer.current);
    };
  }, [lens, reducedMotion, scale]);

  const cols = { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` };

  // 폴백에서만 원본을 가립니다. (굴절 경로는 원본이 굴절되어 보여야 함)
  const maskStyle = (
    !real
      ? {
          "--lens-l": lensL,
          "--lens-r": lensR,
          "--lens-hide": baseOpacity,
          maskImage: LENS_MASK,
          WebkitMaskImage: LENS_MASK,
        }
      : {}
  ) as unknown as CSSProperties;

  return (
    <motion.div
      ref={containerRef}
      className="pointer-events-auto relative isolate w-full max-w-[333px] rounded-full"
      style={{
        scale: containerScale,
        willChange: "transform",
        touchAction: "none",
        // 리퀴드 글래스는 유지하되, 색은 종이/먹 톤 토큰으로만 입힘
        background: "color-mix(in oklab, var(--san-surface) 62%, transparent)",
        boxShadow: "inset 0 0 0 0.75px var(--san-border)",
      }}
    >
      <LiquidGlassLayer />

      {/* 원본 탭 버튼 묶음 (폴백에서는 돋보기 구간이 마스크로 가려집니다) */}
      <motion.div
        className="relative z-10 grid gap-1 p-1.5"
        style={{ ...cols, ...maskStyle }}
      >
        {items.map((item, idx) => {
          const active = idx === displayIndex;

          return (
            <button
              key={item.id}
              ref={(el) => {
                btnRefs.current[idx] = el;
              }}
              type="button"
              aria-current={item.id === value ? "page" : undefined}
              onPointerDown={(e) => handlePointerDown(idx, e)}
              onClick={(e) => {
                if (e.detail === 0 && item.id !== value) onSelect(item.id);
              }}
              className={[
                ITEM_CLASS,
                "relative select-none outline-none [-webkit-tap-highlight-color:transparent]",
                "transition-colors duration-500 ease-ambient focus-visible:ring-1 focus-visible:ring-san-line-strong",
                active ? "text-san-text" : "text-san-muted",
              ].join(" ")}
            >
              {item.icon}
              <span className="text-[10.5px] font-medium tracking-[0.04em]">
                {item.label}
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* 활성 알약 겸 돋보기 */}
      {metric ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 left-0 top-1.5 z-20 overflow-hidden rounded-full"
          style={{
            x,
            width,
            scale,
            willChange: "transform",
            boxShadow: "inset 0 0 0 0.75px var(--san-border)",
          }}
        >
          {/* 평소 알약 배경: 판이 사라지는 만큼 돌아옴 */}
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{
              opacity: baseOpacity,
              // 선택 항목: 한 톤 채워진 면
              background: "var(--san-surface-hover)",
            }}
          />

          {/* 돋보기 반투명판: 크기 복귀와 같은 타이밍으로 페이드 */}
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{
              opacity: progress,
              background: "var(--san-surface-soft)",
            }}
          />

          {lensMounted ? (
            <LiquidGlassLayer
              config={LENS_GLASS}
              fallbackFilter={LENS_FALLBACK_FILTER}
              opacity={progress}
            />
          ) : null}

          {/* 폴백: 굴절이 안 되는 환경에서는 탭바 내용을 복사해 확대해서 보여줌 */}
          {lensMounted && !real ? (
            <motion.div
              className="absolute grid gap-1 p-1.5"
              style={{
                ...cols,
                x: innerX,
                opacity: progress,
                left: 0,
                top: -PAD,
                width: size.w,
                height: size.h,
              }}
            >
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className={[
                    ITEM_CLASS,
                    idx === displayIndex ? "text-san-text" : "text-san-muted",
                  ].join(" ")}
                >
                  {item.icon}
                  <span className="text-[10.5px] font-medium tracking-[0.04em]">
                    {item.label}
                  </span>
                </div>
              ))}
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}
    </motion.div>
  );
}