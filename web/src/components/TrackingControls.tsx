"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";

import { DURATION, EASE_AMBIENT, EASE_EXIT } from "@/lib/motion";
import type { TrackingStatus } from "@/types/tracking";

type TrackingControlsProps = {
  status: TrackingStatus;
  lastMessage?: string;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  showSavePlace?: boolean;
  placeCount?: number;
  onSavePlace?: () => void;
};

const STOP_CONFIRM_DURATION = 2400;

function vibrate(pattern: number | number[]) {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    navigator.vibrate(pattern);
  }
}

function PauseIcon() {
  return (
    <svg className="san-icon san-icon-lg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5.5v13M15 5.5v13" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="san-icon san-icon-lg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 5.2v13.6l10.5-6.8-10.5-6.8Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="san-icon san-icon-md" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="5.5" width="13" height="13" rx="3.2" />
    </svg>
  );
}

// 장소: 종이 위에 켜지는 점과 파문
function PlaceIcon() {
  return (
    <svg className="san-icon san-icon-md" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.8" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TrackingControls({
  status,
  lastMessage,
  onStart,
  onPause,
  onStop,
  showSavePlace = false,
  placeCount = 0,
  onSavePlace,
}: TrackingControlsProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const statusDescriptionId = useId();

  const [stopArmed, setStopArmed] = useState(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const isIdle = status === "idle";
  const isRecording = status === "recording";

  const canSavePlace = showSavePlace && Boolean(onSavePlace);

  const normalizedPlaceCount = Math.max(0, placeCount);
  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current !== null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const disarmStop = useCallback(() => {
    clearStopTimer();
    setStopArmed(false);
  }, [clearStopTimer]);

  useEffect(() => {
    return () => {
      clearStopTimer();
    };
  }, [clearStopTimer]);

  useEffect(() => {
    disarmStop();
  }, [status, disarmStop]);

  const handleStart = useCallback(() => {
    disarmStop();
    vibrate(10);
    onStart();
  }, [disarmStop, onStart]);

  const handlePrimaryAction = useCallback(() => {
    disarmStop();

    if (isRecording) {
      vibrate(8);
      onPause();
      return;
    }

    vibrate(10);
    onStart();
  }, [disarmStop, isRecording, onPause, onStart]);

  const handleSavePlace = useCallback(() => {
    disarmStop();
    vibrate(10);
    onSavePlace?.();
  }, [disarmStop, onSavePlace]);

  const handleStop = useCallback(() => {
    if (!stopArmed) {
      clearStopTimer();
      setStopArmed(true);
      vibrate(8);

      stopTimerRef.current = setTimeout(() => {
        setStopArmed(false);
        stopTimerRef.current = null;
      }, STOP_CONFIRM_DURATION);

      return;
    }

    clearStopTimer();
    setStopArmed(false);
    vibrate([18, 32, 18]);
    onStop();
  }, [clearStopTimer, onStop, stopArmed]);

  // 문구는 정지 확인에만 사용 (나머지는 아이콘과 맥동 점으로 상태 표시)
  const statusMessage = stopArmed ? "한 번 더 누르면 종료" : (lastMessage?.trim() ?? "");

  const swap = reducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0 } },
        exit: { opacity: 0, transition: { duration: 0 } },
      }
    : {
        initial: { opacity: 0, y: 10, filter: "blur(8px)" },
        animate: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: DURATION.enter, ease: EASE_AMBIENT },
        },
        exit: {
          opacity: 0,
          y: 6,
          filter: "blur(6px)",
          transition: { duration: DURATION.exit, ease: EASE_EXIT },
        },
      };

  return (
    <section
      aria-label="경로 기록 제어"
      className="flex w-full flex-col items-center justify-end"
    >
      <AnimatePresence initial={false} mode="wait">
        {isIdle ? (
          <motion.button
            key="start"
            type="button"
            aria-label="경로 기록 시작"
            title="기록 시작"
            aria-describedby={statusDescriptionId}
            onClick={handleStart}
            className="san-pill san-pill-fill relative h-[72px] w-[72px] san-pill-icon"
            {...swap}
          >
            <PlayIcon />
            {/* 시작 전: 버튼 둘레로 번지는 가는 파문 */}
            <span
              aria-hidden="true"
              className="san-ripples san-ripples-bare san-ripples-overlay"
              style={{ ["--size" as string]: "112px" }}
            >
              <i />
              <i />
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="active"
            role="group"
            aria-label="활성 경로 기록 제어"
            className="san-veil flex items-center gap-2 rounded-full p-2"
            {...swap}
          >
            {canSavePlace ? (
              <button
                type="button"
                aria-label={
                  normalizedPlaceCount > 0
                    ? `현재 장소 저장, 지금까지 ${normalizedPlaceCount}개 저장됨`
                    : "현재 장소 저장"
                }
                title="장소 저장"
                aria-describedby={statusDescriptionId}
                onClick={handleSavePlace}
                className="san-pill relative h-[56px] w-[56px] san-pill-icon"
              >
                <PlaceIcon />
                {/* 숫자 배지 대신: 저장한 장소가 있으면 별빛 점 하나 */}
                {normalizedPlaceCount > 0 && (
                  <span
                    className="san-dot san-dot-star absolute right-2.5 top-2.5"
                    aria-hidden="true"
                  />
                )}
              </button>
            ) : (
              <span aria-hidden="true" className="h-[56px] w-[56px]" />
            )}

            <button
              type="button"
              aria-label={isRecording ? "경로 기록 일시정지" : "경로 기록 계속"}
              title={isRecording ? "일시정지" : "계속"}
              aria-describedby={statusDescriptionId}
              onClick={handlePrimaryAction}
              className="san-pill san-pill-fill h-[64px] w-[64px] san-pill-icon"
            >
              {isRecording ? <PauseIcon /> : <PlayIcon />}
            </button>

            <button
              type="button"
              aria-label={stopArmed ? "경로 기록 종료 확인" : "경로 기록 종료"}
              title="종료"
              aria-describedby={statusDescriptionId}
              onClick={handleStop}
              className={`san-pill relative h-[56px] w-[56px] san-pill-icon ${
                stopArmed ? "san-pill-danger" : ""
              }`}
            >
              <StopIcon />
              {stopArmed && (
                <span
                  aria-hidden="true"
                  className="san-ripples san-ripples-bare san-ripples-overlay text-san-error"
                  style={{ ["--size" as string]: "84px" }}
                >
                  <i style={{ borderColor: "currentColor" }} />
                  <i style={{ borderColor: "currentColor" }} />
                </span>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        id={statusDescriptionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mt-3 flex min-h-5 items-center justify-center px-4"
      >
        <AnimatePresence initial={false} mode="wait">
          {statusMessage && (
            <motion.span
              key={statusMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
              className={`rounded-full px-3 py-1 text-center text-[12px] ${
                stopArmed ? "text-san-error" : "text-san-text"
              }`}
            >
              {statusMessage}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
