"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Avatar } from "@/components/Avatar";
import { CrossingLog } from "@/components/signal/CrossingLog";
import { useProfile } from "@/hooks/useProfile";
import { useTheme, type SanTheme } from "@/hooks/useTheme";
import type { SignalStatus } from "@/hooks/useSignal";
import { clearPeerKeys } from "@/lib/encounters";
import {
  loadSignalMemory,
  setSignalMemory,
  type SignalMemory,
} from "@/lib/signalKey";

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
  /** 동행 서클 열기 (게스트는 없음) */
  onOpenCircles?: () => void;
  /** 내가 속한 서클에서 함께 걷는 사람 수 */
  circleMates?: number;
};

const DURATION_MS = 460;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const THEMES: { id: SanTheme; label: string }[] = [
  { id: "light", label: "라이트" },
  { id: "dark", label: "다크" },
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
  onOpenCircles,
  circleMates = 0,
}: SideDrawerProps) {
  const profile = useProfile();
  const { theme, setTheme } = useTheme();
  const reducedMotion = Boolean(useReducedMotion());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const titleId = useId();

  // 다시 스친 사람 알아보기 (로그인 사용자만, 테이블이 준비된 경우에만 보입니다)
  const [memory, setMemory] = useState<SignalMemory | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const memoryOwner = guest ? null : ownerId;

  useEffect(() => {
    if (!open || !memoryOwner) return;
    let cancelled = false;
    void loadSignalMemory(memoryOwner).then((value) => {
      if (!cancelled) setMemory(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open, memoryOwner]);

  async function toggleMemory() {
    if (!memoryOwner || !memory || memoryBusy) return;
    const next = !memory.enabled;
    setMemoryBusy(true);
    try {
      // 끌 때는 그동안 받아 둔 상대 토큰도 함께 지웁니다
      if (!next) await clearPeerKeys(memoryOwner, true);
      setMemory(await setSignalMemory(memoryOwner, next));
    } catch (error) {
      console.error("재식별 설정 변경 실패:", error);
    } finally {
      setMemoryBusy(false);
    }
  }

  const displayName = guest ? "게스트" : (profile?.displayName ?? "산책자");
  const emailText = guest
    ? "기록은 이 기기에만 남아요"
    : (profile?.email ?? email ?? "이메일 정보 없음");

  const signalLine = !signal.on
    ? "내 위치는 대략적으로만 보여요"
    : signal.status === "live"
      ? signal.nearby > 0
        ? `근처에 ${signal.nearby}명`
        : "근처에 아무도 없어요"
      : signal.status === "error"
        ? "연결되지 않았어요"
        : "연결 중";

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
          visibility: visible || open ? "visible" : "hidden",
          willChange: "transform",
          transition: `transform ${duration}ms ${EASE}, opacity ${duration}ms ${EASE}, filter ${duration}ms ${EASE}`,
        }}
      >
        <span aria-hidden="true" className="san-grabber mb-4" />

        <header className="mb-2 flex items-center justify-end">
          <h2 id={titleId} className="sr-only">
            {guest ? "게스트 메뉴" : "계정 메뉴"}
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
            <p className="san-t1 truncate">{displayName}</p>
            <p className="san-t3 mt-0.5 truncate">{emailText}</p>
          </div>
        </div>

        {/* 테마: 둘 중 하나 → 세그먼트 */}
        <section className="mt-9" aria-labelledby={`${titleId}-theme`}>
          <h3 id={`${titleId}-theme`} className="san-eyebrow">
            화면
          </h3>
          <div className="san-seg mt-3" role="radiogroup" aria-labelledby={`${titleId}-theme`}>
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={theme === item.id}
                onClick={() => setTheme(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {/* 동행 서클 */}
        {!guest && onOpenCircles && (
          <section className="mt-9" aria-label="서클">
            <h3 className="san-eyebrow">서클</h3>
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="san-t2 min-w-0 flex-1 truncate">
                {circleMates > 0
                  ? `${circleMates}명과 함께 걷고 있어요`
                  : "아직 함께 걷는 사람이 없어요"}
              </p>
              <button
                type="button"
                className="san-pill san-pill-sm shrink-0"
                onClick={onOpenCircles}
              >
                {circleMates > 0 ? "열기" : "만들기"}
              </button>
            </div>
          </section>
        )}

        {/* 근처 신호 */}
        <section className="mt-9" aria-label="근처 신호">
          <h3 className="san-eyebrow">근처 산책자</h3>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="san-t2">내 아바타 보이기</p>
              <p className="san-t3 mt-0.5 truncate">
                {signalLine}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={signal.on}
              aria-label="근처 산책자에게 내 아바타 보이기"
              className="san-switch"
              onClick={signal.onToggle}
            />
          </div>

          {memoryOwner && memory?.available && (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="san-t2">다시 스친 사람 알아보기</p>
                  <p className="san-t3 mt-0.5">끄면 지금까지의 연결이 지워져요</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={memory.enabled}
                  aria-label="다시 스친 사람 알아보기"
                  disabled={memoryBusy}
                  className="san-switch"
                  onClick={() => void toggleMemory()}
                />
              </div>
            </div>
          )}

          {ownerId && (
            <div className="mt-6">
              <CrossingLog ownerId={ownerId} remote={!guest} />
            </div>
          )}
        </section>

        <section className="mt-9">
          <h3 className="san-eyebrow">지도 출처</h3>

          <p className="san-t3 mt-3">
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
            로그아웃
          </button>
        )}
      </section>
    </dialog>
  );
}
