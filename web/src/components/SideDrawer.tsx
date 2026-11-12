"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Avatar } from "@/components/Avatar";
import { CrossingLog } from "@/components/signal/CrossingLog";
import { useProfile } from "@/hooks/useProfile";
import { useTheme, type SanTheme } from "@/hooks/useTheme";
import type { SignalStatus } from "@/hooks/useSignal";

type SideDrawerProps = {
  open: boolean;
  email?: string | null;
  /** 게스트 모드 여부 */
  guest: boolean;
  onClose: () => void;
  onLogout: () => void;
  /** 게스트 → 로그인 화면으로 */
  onLogin: () => void;
  signal: {
    on: boolean;
    status: SignalStatus;
    callSign: string | null;
    nearby: number;
    onToggle: () => void;
  };
  /** 교차 로그의 주인 (계정 id 또는 게스트 id) */
  ownerId: string | null;
};

const DURATION_MS = 460;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const THEMES: { id: SanTheme; label: string; code: string }[] = [
  { id: "light", label: "종이", code: "LIGHT" },
  { id: "dark", label: "먹", code: "DARK" },
];

export function SideDrawer({
  open,
  email,
  guest,
  onClose,
  onLogout,
  onLogin,
  signal,
  ownerId,
}: SideDrawerProps) {
  const profile = useProfile();
  const { theme, setTheme } = useTheme();
  const reducedMotion = Boolean(useReducedMotion());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const titleId = useId();

  const displayName = guest ? "게스트" : (profile?.displayName ?? "산책자");
  const emailText = guest
    ? "기록은 이 기기에만 남아요"
    : (profile?.email ?? email ?? "이메일 정보 없음");

  const signalLine = !signal.on
    ? "지금은 서로 보이지 않아요"
    : signal.status === "live"
      ? signal.nearby > 0
        ? "가까이에 누군가 걷고 있어요"
        : "근처는 고요해요"
      : signal.status === "error"
        ? "신호가 닿지 않아요"
        : "신호를 여는 중이에요";

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
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-clip border-0 bg-transparent p-0 text-san-text backdrop:bg-transparent"
    >
      {/* 뒤 배경: 단순 페이드 (iOS에서 blur + 투명도 전환은 깜빡임 원인) */}
      <div
        aria-hidden="true"
        className="san-scrim-layer absolute inset-0"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${duration}ms ${EASE}`,
        }}
        onClick={onClose}
      />

      {/* 시트: 아래에서 흐림 속에 떠오르며 또렷해짐 */}
      <section
        className="san-sheet san-no-scrollbar absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-xl overflow-y-auto px-6 pt-3"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          transform: visible ? "translate3d(0,0,0)" : "translate3d(0,36px,0)",
          opacity: visible ? 1 : 0,
          filter: visible || reducedMotion ? "blur(0px)" : "blur(10px)",
          visibility: visible || open ? "visible" : "hidden",
          willChange: "transform",
          transition: `transform ${duration}ms ${EASE}, opacity ${duration}ms ${EASE}, filter ${duration}ms ${EASE}`,
        }}
      >
        <span aria-hidden="true" className="san-grabber mb-4" />

        <header className="mb-5 flex items-center justify-between gap-4">
          <h2 id={titleId} className="san-eyebrow">
            {guest ? "GUEST" : "ACCOUNT"}
          </h2>

          <button
            type="button"
            aria-label="계정 메뉴 닫기"
            onClick={onClose}
            className="san-icon-btn san-icon-btn-plain -mr-3"
          >
            <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </header>

        <div className="flex items-center gap-4">
          <div className="shrink-0 overflow-hidden rounded-full">
            <Avatar
              url={guest ? null : (profile?.avatarUrl ?? null)}
              name={displayName}
              size={52}
            />
          </div>

          <div className="min-w-0">
            <p className="san-title m-0 truncate">{displayName}</p>
            <p className="m-0 mt-0.5 truncate text-[13px] text-san-text">
              {emailText}
            </p>
          </div>
        </div>

        {/* 테마: 종이 / 먹 */}
        <section className="mt-9" aria-label="화면 테마">
          <h3 className="san-eyebrow">THEME</h3>
          <div className="mt-3 flex gap-2" role="group">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="san-pill flex-1"
                aria-pressed={theme === item.id}
                onClick={() => setTheme(item.id)}
              >
                {item.label}
                <span className="font-mono text-[10px] tracking-[0.16em] opacity-80">
                  {item.code}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 근처 신호 */}
        <section className="mt-9" aria-label="근처 신호">
          <h3 className="san-eyebrow flex items-center gap-2">
            SIGNAL
            {signal.callSign && <span>· {signal.callSign}</span>}
          </h3>
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="m-0 flex min-w-0 items-center gap-2.5 text-[14px] text-san-text">
              <span
                className={`san-dot ${
                  signal.on && signal.status === "live"
                    ? "san-dot-live"
                    : "san-dot-faint"
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{signalLine}</span>
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={signal.on}
              aria-label="근처 산책자와 서로 보이기"
              className="san-pill min-h-11 shrink-0 px-5 text-[13px]"
              aria-pressed={signal.on}
              onClick={signal.onToggle}
            >
              {signal.on ? "보이는 중" : "숨는 중"}
            </button>
          </div>
          <p className="san-fade-tail mt-3 text-[12.5px] leading-relaxed text-san-text">
            위치는 100m쯤 흐려서, 그날의 신호명으로만 나눠요. 가까이 잡힌
            산책자의 아바타를 누르면 내 아바타가 그쪽으로 돌아서 인사를
            건넵니다.
          </p>

          {ownerId && (
            <div className="mt-6">
              <CrossingLog ownerId={ownerId} remote={!guest} />
            </div>
          )}
        </section>

        <section className="mt-9">
          <h3 className="san-eyebrow">MAP</h3>

          <p className="mt-3 text-[12px] leading-relaxed text-san-text">
            지도 데이터 ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              OpenStreetMap contributors
            </a>
            , 지도 타일 ©{" "}
            <a
              href="https://carto.com/about-carto/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              CARTO
            </a>
          </p>
        </section>

        {guest ? (
          <button
            type="button"
            onClick={onLogin}
            className="san-pill san-pill-fill mt-9 h-14 w-full"
          >
            로그인하고 기록 이어가기
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="san-pill mt-9 h-14 w-full"
          >
            <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.5 5.5h-4v13h4M14 8.5l3.5 3.5-3.5 3.5M9.5 12h8" />
            </svg>
            로그아웃
          </button>
        )}
      </section>
    </dialog>
  );
}
