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

const COLORS = {
  accent: "#00bfff",
  accentHover: "#33ccff",
  accentText: "#04121c",
  surface: "#0e1722",
  surfaceActive: "#0a2233",
  danger: "#ff715c",
  dangerSoft: "#ff9c8d",
  white: "#ffffff",
} as const;

const STOP_CONFIRM_DURATION = 2400;

const focusRingClass = [
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-[#00bfff]/80",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-offset-[#050b14]",
].join(" ");

const secondaryButtonClass = [
  "relative flex h-[52px] w-[52px] shrink-0",
  "touch-manipulation select-none items-center justify-center",
  "overflow-hidden rounded-full border",
  "text-white/75",
  "shadow-[0_10px_28px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]",
  "backdrop-blur-xl",
  "transition-colors duration-200",
  focusRingClass,
].join(" ");

function vibrate(pattern: number | number[]) {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    navigator.vibrate(pattern);
  }
}

function RecordMark({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-7 w-7 items-center justify-center"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {active ? (
          <motion.span
            key="pause"
            className="absolute flex items-center gap-[5px]"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={{ duration: 0.16 }}
          >
            <span className="block h-5 w-[6px] rounded-full bg-current" />
            <span className="block h-5 w-[6px] rounded-full bg-current" />
          </motion.span>
        ) : (
          <motion.svg
            key="play"
            viewBox="0 0 24 24"
            fill="currentColor"
            focusable="false"
            className="absolute h-7 w-7 translate-x-[2px]"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={{ duration: 0.16 }}
          >
            <path d="M7 5.5c0-.8.9-1.3 1.6-.9l10.2 6.5a1.05 1.05 0 0 1 0 1.8L8.6 19.4c-.7.4-1.6-.1-1.6-.9V5.5Z" />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  );
}

function StopMark({ armed }: { armed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-5 w-5 items-center justify-center"
    >
      <motion.span
        className="block bg-current"
        animate={{
          width: armed ? 16 : 14,
          height: armed ? 16 : 14,
          borderRadius: armed ? 5 : 3,
          rotate: armed ? 45 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 24,
        }}
      />
    </span>
  );
}

function PlaceMark() {
  return (
    <span
      aria-hidden="true"
      className="relative block h-5 w-5"
    >
      <span className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-current" />
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
    </span>
  );
}

function GlassHighlight() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-px rounded-[inherit] bg-gradient-to-b from-white/[0.06] via-transparent to-black/[0.1]"
    />
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
      return "종료하려면 정지 버튼을 한 번 더 누르세요";
    }

    if (lastMessage?.trim()) {
      return lastMessage.trim();
    }

    if (isRecording) {
      return "경로를 기록하고 있어요";
    }

    if (isPaused) {
      return "기록을 잠시 멈췄어요";
    }

    return "경로 기록 준비 완료";
  })();

  const entranceTransition = reducedMotion
    ? { duration: 0.12 }
    : {
        type: "spring" as const,
        stiffness: 340,
        damping: 28,
        mass: 0.76,
      };

  const stateTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 0.22,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const tapAnimation = reducedMotion
    ? undefined
    : {
        scale: 0.92,
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
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.9, y: 10 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.92, y: 8 }
            }
            transition={entranceTransition}
            whileHover={
              reducedMotion
                ? undefined
                : {
                    scale: 1.03,
                    y: -2,
                    backgroundColor: COLORS.accentHover,
                  }
            }
            whileTap={reducedMotion ? undefined : { scale: 0.95, y: 1 }}
            className={[
              "relative flex h-[92px] w-[92px]",
              "touch-manipulation select-none items-center justify-center",
              "overflow-hidden rounded-full border-0",
              focusRingClass,
            ].join(" ")}
            style={{
              backgroundColor: COLORS.accent,
              color: COLORS.accentText,
              boxShadow:
                "0 10px 28px rgba(0,191,255,0.25), 0 22px 56px rgba(0,0,0,0.4)",
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 58%)",
              }}
            />

            <span className="relative z-10 pl-[0.18em] text-[12px] font-extrabold tracking-[0.18em]">
              START
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="active"
            role="group"
            aria-label="활성 경로 기록 제어"
            initial={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.92,
                    y: 14,
                  }
            }
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.94,
                    y: 10,
                  }
            }
            transition={entranceTransition}
            className={[
              "relative grid grid-cols-[52px_76px_52px]",
              "items-center gap-3 rounded-[32px] p-2.5",
              "border border-white/[0.08] bg-[#0e1722]/90",
              "shadow-[0_24px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]",
              "backdrop-blur-2xl",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-px rounded-[31px] bg-gradient-to-b from-white/[0.05] via-transparent to-black/[0.1]"
            />

            {canSavePlace ? (
              <motion.button
                type="button"
                aria-label={
                  normalizedPlaceCount > 0
                    ? `현재 장소 저장, 지금까지 ${normalizedPlaceCount}개 저장됨`
                    : "현재 장소 저장"
                }
                aria-describedby={statusDescriptionId}
                onClick={handleSavePlace}
                whileHover={
                  reducedMotion
                    ? undefined
                    : {
                        scale: 1.05,
                        color: COLORS.accentHover,
                      }
                }
                whileTap={tapAnimation}
                transition={stateTransition}
                className={secondaryButtonClass}
                style={{
                  backgroundColor: COLORS.surfaceActive,
                  borderColor: "rgba(255,255,255,0.15)",
                }}
              >
                <GlassHighlight />

                <span className="relative z-10">
                  <PlaceMark />
                </span>

                <AnimatePresence initial={false}>
                  {normalizedPlaceCount > 0 && (
                    <motion.span
                      key="place-count"
                      aria-hidden="true"
                      initial={{
                        opacity: 0,
                        scale: reducedMotion ? 1 : 0.5,
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                      }}
                      exit={{
                        opacity: 0,
                        scale: reducedMotion ? 1 : 0.5,
                      }}
                      transition={entranceTransition}
                      className={[
                        "absolute -right-1 -top-1 z-20",
                        "flex h-5 min-w-5 items-center justify-center",
                        "rounded-full border-2 border-[#0e1722]",
                        "bg-[#00bfff] px-1",
                        "text-[9px] font-bold leading-none text-[#04121c]",
                        "shadow-[0_4px_12px_rgba(0,0,0,0.35)]",
                      ].join(" ")}
                    >
                      {placeCountLabel}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ) : (
              <span
                aria-hidden="true"
                className="h-[52px] w-[52px]"
              />
            )}

            <div className="relative flex h-[76px] w-[76px] items-center justify-center">
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-[-5px] rounded-full"
                animate={{
                  opacity: isRecording ? 1 : 0,
                  boxShadow: isRecording
                    ? "0 0 0 1px rgba(0,191,255,0.28), 0 0 30px rgba(0,191,255,0.22)"
                    : "0 0 0 1px rgba(255,255,255,0), 0 0 0 rgba(255,255,255,0)",
                }}
                transition={stateTransition}
              />

              <motion.button
                type="button"
                aria-label={
                  isRecording
                    ? "경로 기록 일시정지"
                    : "경로 기록 계속"
                }
                aria-describedby={statusDescriptionId}
                onClick={handlePrimaryAction}
                animate={{
                  backgroundColor: isRecording
                    ? COLORS.accent
                    : "rgba(255,255,255,0.96)",
                  color: isRecording ? COLORS.accentText : "#050b14",
                  boxShadow: isRecording
                    ? "0 10px 28px rgba(0,191,255,0.28), 0 14px 38px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                    : "0 14px 36px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.72), inset 0 -1px 0 rgba(0,0,0,0.1)",
                }}
                whileHover={
                  reducedMotion
                    ? undefined
                    : {
                        scale: 1.035,
                        y: -1,
                      }
                }
                whileTap={
                  reducedMotion
                    ? undefined
                    : {
                        scale: 0.93,
                        y: 1,
                      }
                }
                transition={stateTransition}
                className={[
                  "relative flex h-[76px] w-[76px]",
                  "touch-manipulation select-none items-center justify-center",
                  "overflow-hidden rounded-full",
                  focusRingClass,
                ].join(" ")}
              >
                <GlassHighlight />

                <span className="relative z-10">
                  <RecordMark active={isRecording} />
                </span>
              </motion.button>
            </div>

            <motion.button
              type="button"
              aria-label={
                stopArmed
                  ? "경로 기록 종료 확인"
                  : "경로 기록 종료"
              }
              aria-describedby={statusDescriptionId}
              onClick={handleStop}
              animate={{
                color: stopArmed
                  ? COLORS.dangerSoft
                  : "rgba(255,255,255,0.76)",
                backgroundColor: stopArmed
                  ? "rgba(74,28,24,0.95)"
                  : COLORS.surfaceActive,
                borderColor: stopArmed
                  ? "rgba(255,113,92,0.5)"
                  : "rgba(255,255,255,0.15)",
                boxShadow: stopArmed
                  ? "0 10px 30px rgba(0,0,0,0.35), 0 0 24px rgba(255,113,92,0.18), inset 0 1px 0 rgba(255,255,255,0.08)"
                  : "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
              whileHover={
                reducedMotion
                  ? undefined
                  : {
                      scale: 1.05,
                    }
              }
              whileTap={tapAnimation}
              transition={stateTransition}
              className={secondaryButtonClass}
            >
              <GlassHighlight />

              <span className="relative z-10">
                <StopMark armed={stopArmed} />
              </span>
            </motion.button>
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
            initial={{
              opacity: 0,
              y: reducedMotion ? 0 : 3,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : -3,
            }}
            transition={{
              duration: reducedMotion ? 0.1 : 0.18,
              ease: "easeOut",
            }}
            className={[
              "text-center text-[11px] font-medium tracking-[0.01em]",
              stopArmed ? "text-[#ff9c8d]" : "text-[#8fa3b8]",
            ].join(" ")}
          >
            {statusMessage}
          </motion.span>
        </AnimatePresence>
      </div>
    </section>
  );
}