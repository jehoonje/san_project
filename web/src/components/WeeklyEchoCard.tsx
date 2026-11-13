"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { screenMotion } from "@/lib/motion";
import { Avatar } from "@/components/Avatar";
import {
  fetchEcho,
  lastWeekStart,
  listCircleEchoes,
  onEchoChange,
  shareEcho,
  weekLabel,
  weekStartOf,
  type CircleEcho,
  type EchoState,
} from "@/lib/weeklyEcho";

type WeeklyEchoCardProps = {
  accessToken: string;
  myId: string;
  /** 서클에 함께 걷는 사람이 있는지 */
  hasCircle: boolean;
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 그 주에 걸은 날을 작은 점 일곱 개로 */
function DayDots({ days }: { days: number[] }) {
  const walked = new Set(days);
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <span
          key={day}
          className={`h-1.5 w-1.5 rounded-full ${
            walked.has(day) ? "bg-san-text" : "bg-san-line"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * 주간 잔향: 지난 한 주를 한 장으로.
 * 일요일 밤이 지나면 지난주를, 주 초반이면 직전 주를 보여줍니다.
 */
export function WeeklyEchoCard({ accessToken, myId, hasCircle }: WeeklyEchoCardProps) {
  const reduce = useReducedMotion();
  const [week] = useState(() => {
    // 월~수에는 지난주가 더 읽을 거리가 많습니다
    const kstDay = new Date(Date.now() + 9 * 3600 * 1000).getUTCDay();
    return kstDay >= 1 && kstDay <= 3 ? lastWeekStart() : weekStartOf();
  });
  const [state, setState] = useState<EchoState>({ status: "loading" });
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState<CircleEcho[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchEcho(accessToken, week).then((next) => {
      setState(next);
      if (next.status === "ready") setShared(Boolean(next.echo.sharedAt));
    });
  }, [accessToken, week]);

  useEffect(() => {
    load();
    return onEchoChange(load);
  }, [load]);

  useEffect(() => {
    if (!hasCircle) return;
    listCircleEchoes(week, myId)
      .then(setOthers)
      .catch(() => setOthers([]));
  }, [week, myId, hasCircle]);

  async function toggleShare() {
    if (busy || state.status !== "ready") return;
    setBusy(true);
    const next = !shared;
    try {
      await shareEcho(week, next);
      setShared(next);
    } catch (error) {
      console.error("잔향 건네기 실패:", error);
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-4 px-6 py-7">
        <span className="san-ripples" style={{ ["--size" as string]: "32px" }}>
          <i />
          <i />
        </span>
        <p className="m-0 text-[13px] text-san-text">이번 주를 묶고 있어요</p>
      </div>
    );
  }

  if (state.status === "empty" || state.status === "error") {
    return null;
  }

  const { echo } = state;
  const km = (echo.stats.meters / 1000).toFixed(1);

  return (
    <motion.section
      className="px-6 pb-2 pt-5"
      aria-label="주간 잔향"
      {...screenMotion(reduce)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="san-eyebrow">ECHO · {weekLabel(echo.weekStart)}</p>
        <DayDots days={echo.stats.days} />
      </div>

      <h2 className="san-display mt-3 text-[22px]">{echo.body.title}</h2>

      <div className="mt-3 space-y-1.5">
        {echo.body.lines.map((line) => (
          <p key={line} className="m-0 text-[14px] leading-relaxed text-san-text">
            {line}
          </p>
        ))}
      </div>

      <dl className="m-0 mt-5 flex items-baseline gap-6">
        <div>
          <dt className="sr-only">걸은 거리</dt>
          <dd className="m-0 font-mono text-[24px] font-light leading-none tabular-nums">
            {km}
            <span className="ml-1 text-[10px] tracking-[0.16em]">KM</span>
          </dd>
        </div>
        <div>
          <dt className="san-eyebrow">WALKS</dt>
          <dd className="san-data m-0 mt-1">{echo.stats.routeCount}</dd>
        </div>
        <div>
          <dt className="san-eyebrow">PLACES</dt>
          <dd className="san-data m-0 mt-1">{echo.stats.placeCount}</dd>
        </div>
      </dl>

      {hasCircle && (
        <button
          type="button"
          onClick={() => void toggleShare()}
          disabled={busy}
          aria-pressed={shared}
          className={`san-pill mt-5 min-h-11 px-5 text-[13px] ${
            shared ? "san-pill-fill" : ""
          }`}
        >
          {shared ? "서클에 건넸어요" : "서클에 건네기"}
        </button>
      )}

      {others.length > 0 && (
        <section className="mt-8" aria-label="서클이 건넨 잔향">
          <h3 className="san-eyebrow">FROM CIRCLE</h3>
          <ul className="m-0 mt-3 list-none space-y-1 p-0">
            {others.map((item) => {
              const isOpen = open === item.userId;
              return (
                <li key={item.userId}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : item.userId)}
                    aria-expanded={isOpen}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-[22px] border-0 bg-transparent px-2 text-left transition-colors duration-500 ease-ambient active:bg-san-surface"
                  >
                    <span className="shrink-0 overflow-hidden rounded-full">
                      <Avatar
                        url={item.avatarUrl}
                        name={item.displayName}
                        size={30}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-san-text">
                        {item.body.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-san-muted">
                        {item.displayName}
                      </span>
                    </span>
                    <span className="san-data shrink-0">
                      {(item.stats.meters / 1000).toFixed(1)}km
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1.5 px-2 pb-4 pt-1">
                          {item.body.lines.map((line) => (
                            <p
                              key={line}
                              className="m-0 text-[13px] leading-relaxed text-san-text"
                            >
                              {line}
                            </p>
                          ))}
                          {item.stats.regions[0] && (
                            <p className="san-data m-0 pt-1">
                              {item.stats.regions[0].name} · {DAYS.length > 0 ? `${item.stats.days.length}일` : ""}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </motion.section>
  );
}
