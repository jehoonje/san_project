"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Avatar } from "@/components/Avatar";
import { useProfile } from "@/hooks/useProfile";

type SideDrawerProps = {
  open: boolean;
  email?: string | null;
  onClose: () => void;
  onLogout: () => void;
};

const DURATION_MS = 380;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function SideDrawer({
  open,
  email,
  onClose,
  onLogout,
}: SideDrawerProps) {
  const profile = useProfile();
  const reducedMotion = Boolean(useReducedMotion());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const titleId = useId();

  const displayName = profile?.displayName ?? "러너";
  const emailText = profile?.email ?? email ?? "이메일 정보 없음";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let frame1 = 0;
    let frame2 = 0;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      // 시트는 이 시점에 visibility:hidden 이라 showModal()의 자동 포커스가
      // 화면 밖 버튼으로 가지 않음 → 포커스로 인한 스크롤 점프 방지
      if (!dialog.open) dialog.showModal();

      // 초기 상태(화면 아래)가 한 번 그려진 뒤에 전환 시작 (WKWebView에서 전환 생략 방지)
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);

      if (dialog.open) {
        closeTimer = setTimeout(
          () => {
            if (dialog.open) dialog.close();
          },
          reducedMotion ? 0 : DURATION_MS + 40,
        );
      }
    }

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const duration = reducedMotion ? 0 : DURATION_MS;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-clip border-0 bg-transparent p-0 text-white backdrop:bg-transparent"
    >
      {/* 뒤 배경: 블러 없이 어둡게만 (iOS에서 blur + 투명도 전환은 깜빡임 원인) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/65"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${duration}ms ${EASE}`,
        }}
        onClick={onClose}
      />

      {/* 시트: px 기반이 아닌 translate3d(100%)만 사용, backdrop-filter 제거 */}
      <section
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-xl overflow-y-auto rounded-t-[28px] border border-b-0 border-white/10 px-6 pt-3 shadow-[0_-16px_80px_rgba(0,0,0,0.4)]"
        style={{
          background:
            "linear-gradient(145deg, rgba(29,33,38,.98), rgba(9,12,16,.99))",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
          transform: visible ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          opacity: visible ? 1 : 0,
          visibility: visible || open ? "visible" : "hidden",
          willChange: "transform",
          transition: `transform ${duration}ms ${EASE}, opacity ${duration}ms ${EASE}`,
        }}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-5 h-1 w-9 rounded-full bg-white/20"
        />

        <header className="mb-6 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            내 계정
          </h2>

          <motion.button
            type="button"
            aria-label="계정 메뉴 닫기"
            onClick={onClose}
            whileTap={reducedMotion ? undefined : { scale: 0.94 }}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </motion.button>
        </header>

        <div className="flex items-center gap-4">
          <div className="shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
            <Avatar
              url={profile?.avatarUrl ?? null}
              name={displayName}
              size={48}
            />
          </div>

          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">
              {displayName}
            </p>
            <p className="mt-1 truncate text-sm text-neutral-400">
              {emailText}
            </p>
          </div>
        </div>
{/* 
        <section className="mt-7 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-medium text-neutral-200">카테고리</h3>

            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-neutral-400">
              준비 중
            </span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            카테고리 기능이 추가되면 이곳에서 관리할 수 있어요.
          </p>
        </section> */}

        <section className="mt-7 border-t border-white/10 pt-5">
          <h3 className="text-sm font-medium text-neutral-200">지도 정보</h3>

          <p className="mt-3 text-xs leading-relaxed text-neutral-400">
            지도 데이터 ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              OpenStreetMap contributors
            </a>
            , 지도 스타일 ©{" "}
            <a
              href="https://carto.com/about-carto/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              CARTO
            </a>
          </p>
        </section>

        <motion.button
          type="button"
          onClick={onLogout}
          whileTap={reducedMotion ? undefined : { scale: 0.98 }}
          className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 5H5v14h4M14 8l4 4-4 4M9 12h9" />
          </svg>
          로그아웃
        </motion.button>
      </section>
    </dialog>
  );
}