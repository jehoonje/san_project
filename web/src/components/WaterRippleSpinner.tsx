"use client";

import { memo } from "react";

export interface WaterRippleSpinnerProps {
  /** 스피너 전체 지름(px). 기본값 48 */
  size?: number;
  /** 코어/물결 색상 (CSS color). 기본값 'white' */
  color?: string;
  /** 물결 바깥에 원형 트랙 표시 여부 */
  showTrack?: boolean;
  /** 추가 Tailwind 클래스 */
  className?: string;
}

/**
 * 파동과 중앙 원이 같은 주기를 공유한다.
 * 이 값 하나만 바꾸면 둘의 속도가 함께 바뀐다. (작을수록 빠름)
 */
const CYCLE_SECONDS = 1.2;
/** 파동이 퍼지는 범위 (size 대비 배율) */
const RIPPLE_SCALE_FROM = 0.15;
const RIPPLE_SCALE_TO = 1.0;
/** 중앙 원 크기 (size 대비 비율) */
const CORE_RATIO = 0.09;

/**
 * transform/opacity CSS 키프레임은 컴포지터 스레드에서 실행되므로
 * WebGL 초기화 등 메인 스레드가 바빠도 끊기지 않는다.
 * 중앙 원은 파동이 나타나는 순간(14%)에 가장 커지고,
 * 파동이 퍼지는 동안 천천히 원래 크기로 돌아온다.
 */
const KEYFRAMES = `
@keyframes wrs-scale {
  from { transform: scale(${RIPPLE_SCALE_FROM}); }
  to   { transform: scale(${RIPPLE_SCALE_TO}); }
}
@keyframes wrs-fade {
  0%   { opacity: 0; }
  14%  { opacity: 0.75; }
  100% { opacity: 0; }
}
@keyframes wrs-core {
  0%   { transform: scale(1);    opacity: 0.85; }
  14%  { transform: scale(1.18); opacity: 1; }
  100% { transform: scale(1);    opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) {
  .wrs-ripple, .wrs-core { animation: none !important; }
  .wrs-ripple { opacity: 0.4; transform: scale(${RIPPLE_SCALE_TO}); }
}
`;

function WaterRippleSpinnerBase({
  size = 48,
  color = "white",
  showTrack = false,
  className = "",
}: WaterRippleSpinnerProps) {
  const coreSize = Math.max(4, Math.round(size * CORE_RATIO));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`relative inline-flex items-center justify-center shrink-0 pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <style>{KEYFRAMES}</style>

      {showTrack && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border opacity-20"
          style={{ borderColor: color }}
        />
      )}

      {/* 한 줄 파동 */}
      <span
        aria-hidden
        className="wrs-ripple absolute inset-0 rounded-full border will-change-[transform,opacity]"
        style={{
          borderColor: color,
          borderWidth: 1,
          opacity: 0,
          animation: `wrs-scale ${CYCLE_SECONDS}s cubic-bezier(0.22, 0.61, 0.36, 1) infinite, wrs-fade ${CYCLE_SECONDS}s ease-out infinite`,
        }}
      />

      {/* 코어: 파동과 같은 주기로 반짝 */}
      <span
        aria-hidden
        className="wrs-core relative rounded-full will-change-[transform,opacity]"
        style={{
          width: coreSize,
          height: coreSize,
          backgroundColor: color,
          boxShadow: `0 0 ${Math.round(coreSize * 0.9)}px color-mix(in srgb, ${color} 35%, transparent)`,
          animation: `wrs-core ${CYCLE_SECONDS}s ease-in-out infinite`,
        }}
      />

      <span className="sr-only">Loading…</span>
    </div>
  );
}

const WaterRippleSpinner = memo(WaterRippleSpinnerBase);
WaterRippleSpinner.displayName = "WaterRippleSpinner";

export default WaterRippleSpinner;