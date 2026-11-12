"use client";

import { memo } from "react";

export interface WaterRippleSpinnerProps {
  /** 스피너 전체 지름(px). 기본값 48 */
  size?: number;
  /** 파문 색상 (CSS color). 기본값은 잉크 토큰 */
  color?: string;
  /** 추가 클래스 */
  className?: string;
}

/** 파문 하나가 번지는 주기(초). 숨 쉬듯 느리게 */
const CYCLE_SECONDS = 3;
const RINGS = 3;

/**
 * 곡선 파문 로딩: 가운데 작은 점에서 가는 원이 차례로 번져 나갑니다.
 * transform/opacity 키프레임은 컴포지터 스레드에서 실행되므로
 * WebGL 초기화 등 메인 스레드가 바빠도 끊기지 않습니다.
 */
const KEYFRAMES = `
@keyframes wrs-ripple {
  0%   { transform: scale(0.1); opacity: 0; }
  16%  { opacity: 0.7; }
  100% { transform: scale(1); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .wrs-ripple { animation: none !important; opacity: 0.35 !important; }
}
`;

function WaterRippleSpinnerBase({
  size = 48,
  color = "var(--san-text)",
  className = "",
}: WaterRippleSpinnerProps) {
  const core = Math.max(3, Math.round(size * 0.05));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`relative inline-flex shrink-0 select-none items-center justify-center pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <style>{KEYFRAMES}</style>

      {Array.from({ length: RINGS }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className="wrs-ripple absolute inset-0 rounded-full will-change-[transform,opacity]"
          style={{
            border: `0.75px solid ${color}`,
            opacity: 0,
            animation: `wrs-ripple ${CYCLE_SECONDS}s cubic-bezier(0.22, 1, 0.36, 1) ${
              (CYCLE_SECONDS / RINGS) * index
            }s infinite`,
          }}
        />
      ))}

      <span
        aria-hidden
        className="relative rounded-full"
        style={{ width: core, height: core, backgroundColor: color }}
      />

      <span className="sr-only">Loading…</span>
    </div>
  );
}

const WaterRippleSpinner = memo(WaterRippleSpinnerBase);
WaterRippleSpinner.displayName = "WaterRippleSpinner";

export default WaterRippleSpinner;
