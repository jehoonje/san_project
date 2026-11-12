"use client";

import { useCallback, useEffect, useId, useRef } from "react";

export type WheelOption<T extends string> = {
  value: T;
  label: string;
};

type WheelPickerProps<T extends string> = {
  options: readonly WheelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** 보이는 줄 수 (홀수). 기본 5 */
  rows?: number;
};

const ROW = 44; // 터치 영역 44pt

function vibrate() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(6);
  }
}

/**
 * 세로 휠 피커.
 * 가운데 줄이 선택이며, 중심에서 멀수록 흐려지고 옅어집니다.
 * 선택된 줄에는 얇은 체크 하나만 표시합니다.
 */
export function WheelPicker<T extends string>({
  options,
  value,
  onChange,
  label,
  rows = 5,
}: WheelPickerProps<T>) {
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const frameRef = useRef(0);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const height = ROW * rows;
  const pad = (height - ROW) / 2;

  // 중심에서의 거리에 따라 블러·투명도 갱신 (렌더 없이 스타일만)
  const paint = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const center = scroller.scrollTop / ROW;
    itemRefs.current.forEach((el, index) => {
      if (!el) return;
      const d = Math.abs(index - center);
      el.style.opacity = String(Math.max(0.16, 1 - d * 0.34));
      el.style.filter = d < 0.2 ? "none" : `blur(${Math.min(3.2, d * 1.3).toFixed(2)}px)`;
      el.dataset.center = d < 0.5 ? "true" : "false";
    });
  }, []);

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({
      top: index * ROW,
      behavior: smooth && !reduce ? "smooth" : "auto",
    });
  }, []);

  // 바깥에서 값이 바뀌면(가까운 장소를 골랐을 때 등) 그 줄로 이동
  useEffect(() => {
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const scroller = scrollerRef.current;
    const current = scroller ? Math.round(scroller.scrollTop / ROW) : -1;
    const changed = valueRef.current !== value;
    valueRef.current = value;
    if (current !== index) scrollToIndex(index, changed);
    paint();
  }, [options, paint, scrollToIndex, value]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    },
    [],
  );

  function handleScroll() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(paint);

    // 스크롤이 멎으면 가운데 줄을 선택으로 확정 (햅틱은 이때 한 번만)
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(scroller.scrollTop / ROW)),
      );
      const next = options[index];
      if (next && next.value !== valueRef.current) {
        valueRef.current = next.value;
        vibrate();
        onChangeRef.current(next.value);
      }
    }, 140);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const index = options.findIndex((option) => option.value === valueRef.current);
    if (event.key === "ArrowDown" && index < options.length - 1) {
      event.preventDefault();
      scrollToIndex(index + 1, true);
    } else if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      scrollToIndex(index - 1, true);
    }
  }

  return (
    <div className="relative" style={{ height }}>
      {/* 가운데 선택 줄: 한 톤 채워진 면 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 rounded-full bg-san-surface"
        style={{ top: pad, height: ROW }}
      />

      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${value}`}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="san-no-scrollbar relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-[22px] outline-none focus-visible:ring-1 focus-visible:ring-san-line-strong"
        style={{ paddingBlock: pad, touchAction: "pan-y" }}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              id={`${id}-${option.value}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => scrollToIndex(index, true)}
              className="group relative flex w-full snap-center items-center justify-center border-0 bg-transparent text-[16px] font-light tracking-[0.02em] text-san-text"
              style={{ height: ROW, willChange: "opacity, filter" }}
            >
              {option.label}
              <svg
                className="san-icon absolute right-5 opacity-0 transition-opacity duration-300 group-data-[center=true]:opacity-100"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m6 12.5 4 4 8-9" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
