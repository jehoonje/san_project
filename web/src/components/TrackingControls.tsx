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
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 6.5v11M14.5 6.5v11" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6.2v11.6l9-5.8-9-5.8Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2.5" />
    </svg>
  );
}

// 장소: 종이 위에 켜지는 점과 파문
function PlaceIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" />
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
  const isPaused = status === "paused";

  const canSavePlace = showSavePlace && Boolean(onSavePlace);

  const normalizedPlaceCount = Math.max(0, placeCount);
  const placeCountLabel =
    normalizedPlaceCount > 99 ? "99+" : String(normalizedPlaceCount);

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

  const statusMessage = (() => {
    if (stopArmed) {
      return "마치려면 한 번 더 눌러주세요";
    }

    if (lastMessage?.trim()) {
      return lastMessage.trim();
    }

    if (isRecording) {
      return "걸음이 선으로 남고 있어요";
    }

    if (isPaused) {
      return "기록을 잠시 멈췄어요";
    }

    return "걸을 준비가 됐어요";
  })();

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
            aria-describedby={statusDescriptionId}
            onClick={handleStart}
            className="san-pill san-pill-fill h-[60px] gap-3 px-9 text-[15px]"
            {...swap}
          >
            <span className="san-dot bg-san-on-accent" aria-hidden="true" />
            걷기 시작
          </motion.button>
        ) : (
          <motion.div
            key="active"
            role="group"
            aria-label="활성 경로 기록 제어"
            className="san-veil flex items-center gap-1.5 rounded-full p-1.5"
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
                aria-describedby={statusDescriptionId}
                onClick={handleSavePlace}
                className="san-pill relative h-[52px] gap-2 px-5"
              >
                <PlaceIcon />
                <span>장소</span>
                {/* 숫자 배지 대신: 저장한 장소가 있으면 별빛 점 하나 */}
                {normalizedPlaceCount > 0 && (
                  <span
                    className="san-dot san-dot-star absolute right-3 top-3"
                    aria-hidden="true"
                  />
                )}
              </button>
            ) : (
              <span aria-hidden="true" className="h-[52px] w-[52px]" />
            )}

            <button
              type="button"
              aria-label={isRecording ? "경로 기록 일시정지" : "경로 기록 계속"}
              aria-describedby={statusDescriptionId}
              onClick={handlePrimaryAction}
              className="san-pill san-pill-fill h-[52px] min-w-[112px] gap-2 px-6"
            >
              {isRecording ? <PauseIcon /> : <PlayIcon />}
              <span>{isRecording ? "잠시 멈춤" : "이어 걷기"}</span>
            </button>

            <button
              type="button"
              aria-label={stopArmed ? "경로 기록 종료 확인" : "경로 기록 종료"}
              aria-describedby={statusDescriptionId}
              onClick={handleStop}
              className={`san-pill h-[52px] gap-2 px-5 ${
                stopArmed ? "san-pill-danger" : ""
              }`}
            >
              <StopIcon />
              <span>{stopArmed ? "한 번 더" : "마침"}</span>
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
          <motion.span
            key={statusMessage}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-center text-[12px] ${
              stopArmed ? "text-san-error" : "text-san-text"
            }`}
          >
            {isRecording && !stopArmed && (
              <span className="san-dot san-dot-live" aria-hidden="true" />
            )}
            {statusMessage}
          </motion.span>
        </AnimatePresence>
      </div>
    </section>
  );
}
