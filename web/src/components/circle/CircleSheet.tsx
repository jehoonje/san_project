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
  listCircleWalks,
  onCirclesChange,
  renewInviteCode,
  type Circle,
  type CircleMember,
} from "@/lib/circles";
import type { SavedRoute } from "@/types/route";

type CircleSheetProps = {
  myId: string;
  onClose: () => void;
  /** 서클 사람의 걸음 하나를 열어 볼 때 */
  onOpenWalk: (route: SavedRoute, member: CircleMember) => void;
};

type Focus = { circle: Circle; member: CircleMember };

function walkStamp(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--.--";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

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
export function CircleSheet({ myId, onClose, onOpenWalk }: CircleSheetProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 한 사람을 고르면 그 사람의 걸음을 보여줍니다
  const [focus, setFocus] = useState<Focus | null>(null);
  const [walks, setWalks] = useState<SavedRoute[] | null>(null);

  function openMember(circle: Circle, member: CircleMember) {
    setFocus({ circle, member });
    setWalks(null);
    listCircleWalks(member.userId)
      .then(setWalks)
      .catch((error) => {
        console.error("서클 걸음 조회 실패:", error);
        setWalks([]);
      });
  }

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
            <h2 id={titleId} className="san-t1">
              서클
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

        {focus ? (
          <section aria-label={`${focus.member.displayName}의 걸음`}>
            <button
              type="button"
              className="san-pill san-pill-quiet -ml-2 min-h-11 gap-1.5 px-3 text-[13px]"
              onClick={() => setFocus(null)}
            >
              <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.5 18-6-6 6-6" />
              </svg>
              {focus.circle.name}
            </button>

            <div className="mt-4 flex items-center gap-3">
              <span className="shrink-0 overflow-hidden rounded-full">
                <Avatar
                  url={focus.member.avatarUrl}
                  name={focus.member.displayName}
                  size={40}
                />
              </span>
              <p className="san-t1 min-w-0 flex-1 truncate">
                {focus.member.displayName}
              </p>
            </div>

            <h3 className="san-eyebrow" style={{ marginTop: 28 }}>
              걸음
            </h3>
            {walks === null ? (
              <div className="flex justify-center py-8">
                <span className="san-ripples" style={{ ["--size" as string]: "36px" }}>
                  <i />
                  <i />
                </span>
              </div>
            ) : walks.length === 0 ? (
              <p className="san-t2 mt-3">아직 걸음이 없어요.</p>
            ) : (
              <ul className="m-0 mt-2 list-none p-0">
                {walks.map((walk) => (
                  <li key={walk.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenWalk(walk, focus.member);
                        onClose();
                      }}
                      className="flex min-h-12 w-full items-center gap-3 whitespace-nowrap rounded-[14px] border-0 bg-transparent px-2 text-left transition-colors duration-500 ease-ambient active:bg-san-surface"
                    >
                      <span className="san-data w-[5ch] shrink-0">
                        {walkStamp(walk.started_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-san-text">
                        {walk.title}
                      </span>
                      {walk.route_places.length > 0 && (
                        <span className="san-t3 shrink-0">
                          장소 {walk.route_places.length}
                        </span>
                      )}
                      <span className="san-data shrink-0">
                        {((Number(walk.distance_meters) || 0) / 1000).toFixed(1)}km
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {focus.circle.createdBy === myId && (
              <button
                type="button"
                className="san-pill san-pill-sm san-pill-danger mt-8"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await leaveCircle(focus.circle.id, focus.member.userId);
                    setFocus(null);
                  }, "서클에서 내보냈어요")
                }
              >
                서클에서 내보내기
              </button>
            )}
          </section>
        ) : (
          <>
        <p className="san-t3 mb-7">
          함께한 뒤의 걸음만 서로 보여요. 최대 {CIRCLE_MAX}명.
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
                  {circle.members.map((member) => {
                    const face = (
                      <>
                        <span className="overflow-hidden rounded-full">
                          <Avatar
                            url={member.avatarUrl}
                            name={member.displayName}
                            size={28}
                          />
                        </span>
                        <span className="text-[13px] text-san-text">
                          {member.userId === myId ? "나" : member.displayName}
                        </span>
                      </>
                    );
                    return (
                      <li key={member.userId}>
                        {member.userId === myId ? (
                          <span className="flex min-h-11 items-center gap-2">
                            {face}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="flex min-h-11 items-center gap-2 rounded-full border-0 bg-transparent p-0 pr-2 transition-opacity duration-500 ease-ambient active:opacity-60"
                            onClick={() => openMember(circle, member)}
                            aria-label={`${member.displayName}의 걸음 보기`}
                          >
                            {face}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="san-pill san-pill-sm gap-2"
                    onClick={() => void copyCode(circle.inviteCode)}
                    aria-label={`${circle.name} 초대 코드 복사`}
                  >
                    <CopyIcon />
                    <span className="tabular-nums">
                      {circle.inviteCode}
                    </span>
                  </button>
                  {circle.createdBy === myId && (
                    <button
                      type="button"
                      className="san-pill san-pill-sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => renewInviteCode(circle.id),
                          "코드를 바꿨어요. 예전 코드는 쓸 수 없어요",
                        )
                      }
                    >
                      코드 바꾸기
                    </button>
                  )}
                  <button
                    type="button"
                    className="san-pill san-pill-sm"
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
          <h3 className="san-eyebrow">새 서클</h3>
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
          <h3 className="san-eyebrow">초대 코드로 참여</h3>
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={8}
              placeholder="초대 코드"
              autoCapitalize="characters"
              autoComplete="off"
              className="san-field-input flex-1"
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
          </>
        )}

        <p
          role="status"
          className="mt-5 min-h-5 text-center text-[13px] text-san-text"
        >
          {message}
        </p>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
