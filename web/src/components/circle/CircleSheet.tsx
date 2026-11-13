"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { dialogMotion, scrimMotion } from "@/lib/motion";
import { Avatar } from "@/components/Avatar";
import {
  CIRCLE_MAX,
  createCircle,
  joinCircle,
  leaveCircle,
  listCircles,
  onCirclesChange,
  type Circle,
} from "@/lib/circles";

type CircleSheetProps = {
  myId: string;
  onClose: () => void;
};

const ERRORS: Record<string, string> = {
  circle_not_found: "그런 코드는 없어요",
  circle_full: "이 서클은 자리가 찼어요",
  name_required: "이름을 적어주세요",
};

function CopyIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 6.5V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15h1" />
    </svg>
  );
}

/**
 * 동행 서클: 3~8명의 작은 묶음.
 * 서클 안에서만 서로의 걸음과 장소가 보입니다.
 */
export function CircleSheet({ myId, onClose }: CircleSheetProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    listCircles()
      .then(setCircles)
      .catch((error) => {
        console.error("서클 조회 실패:", error);
        setCircles([]);
      });
  }, []);

  useEffect(() => {
    load();
    return onCirclesChange(load);
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setMessage(done);
    } catch (error) {
      const key = error instanceof Error ? error.message : "";
      console.error("서클 작업 실패:", error);
      setMessage(ERRORS[key] ?? "다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("코드를 복사했어요");
    } catch {
      setMessage(value);
    }
  }

  return createPortal(
    <motion.div
      className="san-scrim-layer fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      {...scrimMotion(reduce)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="san-sheet san-no-scrollbar flex max-h-[min(90dvh,760px)] w-full max-w-none flex-col overflow-y-auto px-6 pt-3 sm:max-w-[480px] sm:rounded-[28px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        {...dialogMotion(reduce, "bottom")}
      >
        <span aria-hidden="true" className="san-grabber mb-4" />

        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="san-eyebrow">CIRCLE</p>
            <h2 id={titleId} className="san-title mt-2">
              동행
            </h2>
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
        </header>

        <p className="mb-7 text-[12.5px] leading-relaxed text-san-text">
          서클 안에서만 서로의 걸음과 장소가 보여요. 최대 {CIRCLE_MAX}명까지
          함께할 수 있고, 나가면 그때부터 보이지 않아요.
        </p>

        {circles === null ? (
          <div className="flex justify-center py-10">
            <span className="san-ripples" style={{ ["--size" as string]: "40px" }}>
              <i />
              <i />
            </span>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-7 p-0">
            {circles.map((circle) => (
              <li key={circle.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="m-0 text-[15px] text-san-text">{circle.name}</p>
                  <span className="san-data">
                    {circle.members.length}/{CIRCLE_MAX}
                  </span>
                </div>

                <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-3 p-0">
                  {circle.members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex items-center gap-2"
                      title={member.displayName}
                    >
                      <span className="overflow-hidden rounded-full">
                        <Avatar
                          url={member.avatarUrl}
                          name={member.displayName}
                          size={28}
                        />
                      </span>
                      <span className="text-[12.5px] text-san-text">
                        {member.userId === myId ? "나" : member.displayName}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    className="san-pill min-h-11 gap-2 px-4 text-[13px]"
                    onClick={() => void copyCode(circle.inviteCode)}
                    aria-label={`${circle.name} 초대 코드 복사`}
                  >
                    <CopyIcon />
                    <span className="font-mono tracking-[0.14em]">
                      {circle.inviteCode}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="san-pill san-pill-quiet min-h-11 px-4 text-[13px]"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => leaveCircle(circle.id, myId),
                        "서클에서 나왔어요",
                      )
                    }
                  >
                    나가기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-9" aria-label="서클 만들기">
          <h3 className="san-eyebrow">NEW</h3>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              placeholder="서클 이름"
              className="san-field-input flex-1"
              aria-label="서클 이름"
            />
            <button
              type="button"
              className="san-pill san-pill-fill h-[54px] shrink-0 px-6"
              disabled={busy || !name.trim()}
              onClick={() =>
                void run(async () => {
                  await createCircle(name);
                  setName("");
                }, "서클을 만들었어요")
              }
            >
              만들기
            </button>
          </div>
        </section>

        <section className="mt-7" aria-label="서클 참여">
          <h3 className="san-eyebrow">JOIN</h3>
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={8}
              placeholder="초대 코드"
              autoCapitalize="characters"
              autoComplete="off"
              className="san-field-input flex-1 font-mono tracking-[0.2em]"
              aria-label="초대 코드"
            />
            <button
              type="button"
              className="san-pill h-[54px] shrink-0 px-6"
              disabled={busy || code.trim().length !== 8}
              onClick={() =>
                void run(async () => {
                  await joinCircle(code);
                  setCode("");
                }, "서클에 들어왔어요")
              }
            >
              들어가기
            </button>
          </div>
        </section>

        <p
          role="status"
          className="mt-5 min-h-5 text-center text-[12.5px] text-san-text"
        >
          {message}
        </p>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
