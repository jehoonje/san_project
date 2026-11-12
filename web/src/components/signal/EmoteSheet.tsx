"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion } from "@/lib/motion";
import {
  EMOTES,
  distanceLabel,
  emoteInfo,
  type EmoteId,
} from "@/lib/signal";
import type { Peer, Relation } from "@/hooks/useSignal";
import { EmoteIcon } from "./EmoteIcon";

type Props = {
  peer: Peer;
  relation: Relation | undefined;
  onEmote: (emote: EmoteId) => void;
  onClose: () => void;
};

/**
 * 지도에서 산책자의 아바타를 고르면 떠오르는 시트.
 * 내 아바타가 그쪽으로 돌아서고, 다섯 가지 몸짓 중 하나를 건넬 수 있습니다.
 * 상대는 프로필이나 숫자 없이 "거리 감각" 한 줄로만 묘사합니다.
 */
export function EmoteSheet({ peer, relation, onEmote, onClose }: Props) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const line = relation?.crossed
    ? "서로 인사를 나눈 사이예요"
    : relation?.theirs
      ? `방금 ${emoteInfo(relation.theirs).got}`
      : relation?.mine
        ? `${emoteInfo(relation.mine).done} · 답을 기다려요`
        : "";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[58] flex justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
    >
      <motion.section
        role="dialog"
        aria-label={`${peer.cs} 에게 감정 표현 건네기`}
        className="san-veil pointer-events-auto w-full max-w-md rounded-[28px] px-5 pb-5 pt-4"
        {...dialogMotion(reduce, "bottom")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="san-eyebrow flex items-center gap-2">
              <span
                className={`san-dot ${relation?.crossed ? "san-dot-star" : "san-dot-live"}`}
                aria-hidden="true"
              />
              {peer.cs}
            </p>
            <p className="san-title mt-2">{distanceLabel(peer.distance)}</p>
            {line && (
              <p className="mt-0.5 text-[13px] text-san-text" role="status">
                {line}
              </p>
            )}
          </div>

          <button
            type="button"
            className="san-icon-btn san-icon-btn-plain -mr-2 -mt-1"
            onClick={onClose}
            aria-label="닫기"
          >
            <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </div>

        {/* 다섯 가지 몸짓: 글자 없이 아이콘만 */}
        <div
          className="mt-4 flex justify-between gap-2"
          role="group"
          aria-label="감정 표현"
        >
          {EMOTES.map((emote) => (
            <button
              key={emote.id}
              type="button"
              className="san-pill h-[52px] w-[52px] shrink-0 p-0"
              aria-pressed={relation?.mine === emote.id}
              aria-label={emote.label}
              title={emote.label}
              onClick={() => onEmote(emote.id)}
            >
              <EmoteIcon id={emote.id} />
            </button>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
