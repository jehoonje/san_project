"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toastMotion } from "@/lib/motion";
import { emoteInfo } from "@/lib/signal";
import type { SignalNotice } from "@/hooks/useSignal";

type Props = {
  notice: SignalNotice | null;
  /** 인사에 답하기: 그 산책자를 골라 감정 표현 시트를 엶 */
  onReply: (sid: string) => void;
  onDismiss: (id: string) => void;
};

// 위쪽에 잠시 떠오르는 신호 알림 (인사를 받음 / 서로 인사를 나눠 교차 로그에 남음)
export function SignalNoticeBanner({ notice, onReply, onDismiss }: Props) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => onDismiss(notice.id),
      notice.kind === "emote" ? 12000 : 6000,
    );
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[57] flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 84px)" }}
    >
      <AnimatePresence mode="wait">
        {notice && (
          <motion.div
            key={notice.id}
            className="san-veil pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full py-2 pl-5 pr-2"
            role="status"
            aria-live="polite"
            {...toastMotion(reduce)}
          >
            <span
              className={`san-dot ${notice.kind === "crossing" ? "san-dot-star" : "san-dot-live"}`}
              aria-hidden="true"
            />
            <p className="m-0 min-w-0 flex-1 truncate text-[13px] text-san-text">
              <span className="san-data mr-2">{notice.cs}</span>
              {notice.kind === "crossing"
                ? "서로 스쳤어요 · 교차 로그에 남겼어요"
                : `가까이서 ${emoteInfo(notice.emote).got}`}
            </p>
            {notice.kind === "emote" ? (
              <button
                type="button"
                className="san-pill san-pill-fill min-h-11 px-4 text-[13px]"
                onClick={() => {
                  onReply(notice.sid);
                  onDismiss(notice.id);
                }}
              >
                답하기
              </button>
            ) : (
              <button
                type="button"
                className="san-icon-btn san-icon-btn-plain h-11 w-11"
                onClick={() => onDismiss(notice.id)}
                aria-label="알림 닫기"
              >
                <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
                </svg>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
