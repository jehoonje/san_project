"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AnalysisReportResponse,
  MissingInsightPlace,
  PersonalReport,
  PlaceAnalysisStats,
  RankedStat,
} from "@/types/analysis";

type AnalysisReportProps = {
  accessToken: string;
};

type LoadState =
  | { status: "loading"; message: string; current: number; total: number }
  | { status: "ready"; data: AnalysisReportResponse; warning: string | null }
  | { status: "error"; message: string };

type LoadingState = Extract<LoadState, { status: "loading" }>;
type FinalState = Exclude<LoadState, { status: "loading" }>;

const INITIAL_LOADING: LoadingState = {
  status: "loading",
  message: "방문 기록을 분석하는 중...",
  current: 0,
  total: 0,
};

const MOOD_LABELS: Record<string, string> = {
  calm: "차분함",
  lively: "활기참",
  cozy: "아늑함",
  trendy: "트렌디",
  vintage: "빈티지",
  minimal: "미니멀",
  romantic: "로맨틱",
  family: "가족 친화",
  work_friendly: "작업 친화",
};

const GLASS_CARD =
  "rounded-[24px] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025))] shadow-[0_16px_40px_rgba(0,0,0,.2)] backdrop-blur-xl";

async function parseResponse(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(json?.error ?? "request_failed") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return json;
}

function authHeaders(accessToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

async function loadReport(
  accessToken: string,
  force: boolean,
  onProgress: (state: LoadingState) => void,
): Promise<FinalState> {
  const headers = authHeaders(accessToken);

  try {
    const firstResponse = await fetch("/api/analysis-report", {
      method: "POST",
      headers,
      body: JSON.stringify({ force }),
    });
    const first = (await parseResponse(
      firstResponse,
    )) as AnalysisReportResponse;

    if (first.status !== "needs_enrichment") {
      return { status: "ready", data: first, warning: null };
    }

    const total = first.missingPlaces.length;
    let completed = 0;
    let limitReached = false;

    for (const place of first.missingPlaces as MissingInsightPlace[]) {
      onProgress({
        status: "loading",
        message: `장소 정보를 확인하는 중 (${completed + 1}/${total})`,
        current: completed,
        total,
      });

      try {
        const response = await fetch("/api/place-insight", {
          method: "POST",
          headers,
          body: JSON.stringify(place),
        });
        await parseResponse(response);
        completed += 1;
      } catch (error) {
        const requestError = error as Error & { status?: number };

        if (requestError.status === 429) {
          limitReached = true;
          break;
        }

        console.error("장소 인사이트 생성 실패:", place.name, error);
        completed += 1;
      }
    }

    onProgress({
      status: "loading",
      message: "개인 취향 리포트를 작성하는 중...",
      current: completed,
      total,
    });

    const finalResponse = await fetch("/api/analysis-report", {
      method: "POST",
      headers,
      body: JSON.stringify({ force, allowPartial: true }),
    });
    const final = (await parseResponse(
      finalResponse,
    )) as AnalysisReportResponse;

    return {
      status: "ready",
      data: final,
      warning: limitReached
        ? "이번 달 검색 한도에 도달해 저장된 정보만으로 리포트를 만들었습니다."
        : null,
    };
  } catch (error) {
    console.error("분석 리포트 로드 실패:", error);

    return {
      status: "error",
      message: "분석 리포트를 불러오지 못했습니다.",
    };
  }
}

function PinIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />
    </svg>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${GLASS_CARD} p-4`}>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-[-0.02em] text-neutral-100">
        {value}
      </p>
    </div>
  );
}

function RankedBars({ items }: { items: RankedStat[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">표시할 데이터가 없습니다.</p>;
  }

  return (
    <ul className="space-y-4">
      {items.slice(0, 6).map((item) => (
        <li key={item.key}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-neutral-200">
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-neutral-500">
              {item.count}회 · {item.percent}%
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
            role="progressbar"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.percent}
          >
            <div
              className="h-full rounded-full bg-[#00bfff] shadow-[0_0_12px_rgba(0,191,255,.45)] transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.max(item.percent, 3)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${GLASS_CARD} p-5`}>
      <h2 className="mb-4 text-base font-semibold tracking-[-0.01em] text-neutral-100">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ReportText({ report }: { report: PersonalReport }) {
  const paragraphs = [
    ["나의 장소 취향", report.identity],
    ["카테고리 취향", report.categoryPreference],
    ["자주 찾는 지역", report.areaPreference],
    ["방문 시간 패턴", report.timePattern],
    ["분위기와 소비 성향", report.moodAndSpending],
    ["메뉴 취향", report.favoriteMenus],
  ];

  return (
    <>
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(14,23,34,.96),rgba(5,11,20,.98))] p-6 shadow-[0_24px_70px_rgba(0,0,0,.4)]">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#00bfff]/[0.09] blur-3xl"
          aria-hidden="true"
        />
        <p className="relative flex items-center gap-1.5 text-xs font-medium text-[#00bfff]">
          <SparkIcon />
          Gemini 취향 리포트
        </p>
        <h2 className="relative mt-3 text-xl font-semibold leading-snug tracking-[-0.02em] text-white">
          {report.title}
        </h2>
        <p className="relative mt-3 text-sm leading-7 text-neutral-300">
          {report.summary}
        </p>
      </div>

      <Section title="상세 분석">
        <div className="divide-y divide-white/[0.07]">
          {paragraphs.map(([label, value]) => (
            <div key={label} className="py-4 first:pt-0 last:pb-0">
              <h3 className="text-sm font-semibold text-neutral-200">{label}</h3>
              <p className="mt-1.5 text-sm leading-7 text-neutral-400">
                {value || "분석할 데이터가 부족합니다."}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {report.recommendations.length > 0 && (
        <Section title="다음 기록 제안">
          <ul className="space-y-2">
            {report.recommendations.map((item, index) => (
              <li
                key={`${index}-${item}`}
                className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm leading-6 text-neutral-300"
              >
                <span
                  className="mt-0.5 shrink-0 tabular-nums text-[#00bfff]"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.caveat && (
        <p className="px-1 text-xs leading-5 text-neutral-500">{report.caveat}</p>
      )}
    </>
  );
}

function AnalysisBody({
  stats,
  report,
}: {
  stats: PlaceAnalysisStats;
  report: PersonalReport | null;
}) {
  if (stats.totalVisits === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="text-neutral-600">
          <PinIcon />
        </span>
        <h2 className="mt-5 text-base font-semibold text-neutral-100">
          아직 분석할 장소가 없어요
        </h2>
        <p className="mt-2 max-w-[30ch] text-sm leading-6 text-neutral-500">
          루트를 기록하면서 장소를 저장하면 카테고리, 지역, 시간대 취향을
          분석해 드립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-12">
      {report && <ReportText report={report} />}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="기록된 루트" value={`${stats.routeCount}개`} />
        <StatCard label="장소 방문" value={`${stats.totalVisits}회`} />
        <StatCard label="고유 장소" value={`${stats.uniquePlaces}곳`} />
        <StatCard
          label="평균 체류"
          value={
            stats.averageDwellMinutes === null
              ? "데이터 없음"
              : `${stats.averageDwellMinutes}분`
          }
        />
      </div>

      <Section title="자주 간 카테고리">
        <RankedBars items={stats.categories} />
      </Section>

      <Section title="자주 간 지역">
        <RankedBars items={stats.regions} />
      </Section>

      <Section title="방문 시간대">
        <RankedBars items={stats.timeSlots} />
        <p className="mt-5 border-t border-white/[0.07] pt-4 text-xs tabular-nums text-neutral-500">
          평일 {stats.weekdayVisits}회 · 주말 {stats.weekendVisits}회
        </p>
      </Section>

      {(stats.topKeywords.length > 0 ||
        stats.topMoods.length > 0 ||
        stats.topMenus.length > 0) && (
        <Section title="장소 키워드">
          <div className="flex flex-wrap gap-2">
            {stats.topKeywords.map((item) => (
              <span
                key={`keyword-${item.label}`}
                className="rounded-full border border-[#00bfff]/25 bg-[#00bfff]/10 px-3 py-1.5 text-xs font-medium text-[#7fdfff]"
              >
                {item.label} · {item.count}
              </span>
            ))}
            {stats.topMoods.map((item) => (
              <span
                key={`mood-${item.label}`}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-neutral-300"
              >
                {MOOD_LABELS[item.label] ?? item.label} · {item.count}
              </span>
            ))}
            {stats.topMenus.map((item) => (
              <span
                key={`menu-${item.label}`}
                className="rounded-full border border-[#f2c879]/20 bg-[#f2c879]/[0.08] px-3 py-1.5 text-xs font-medium text-[#f0d6a4]"
              >
                {item.label} · {item.count}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function AnalysisReport({ accessToken }: AnalysisReportProps) {
  const [state, setState] = useState<LoadState>(INITIAL_LOADING);

  const run = useCallback(
    async (force: boolean) => {
      setState(INITIAL_LOADING);
      const next = await loadReport(accessToken, force, setState);
      setState(next);
    },
    [accessToken],
  );

  useEffect(() => {
    let cancelled = false;

    void loadReport(accessToken, false, (progress) => {
      if (!cancelled) setState(progress);
    }).then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (state.status === "loading") {
    const progress =
      state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;

    return (
      <div
        className="flex h-full flex-col items-center justify-center px-8 text-center"
        role="status"
        aria-live="polite"
      >
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#00bfff] motion-reduce:animate-none" />
        <p className="mt-5 text-sm font-medium text-neutral-200">
          {state.message}
        </p>
        {state.total > 0 && (
          <div
            className="mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.07]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-[#00bfff] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          처음 한 번은 장소 검색 때문에 시간이 걸릴 수 있어요.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p role="alert" className="text-sm text-[#ff8b78]">
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => void run(false)}
          className="mt-5 min-h-11 rounded-2xl bg-[#ffffff] px-5 text-sm font-semibold text-[#050b14] transition hover:bg-white active:scale-95"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-[#050b14] text-white">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[#050b14]/80 px-4 py-2.5 backdrop-blur-2xl">
        <div className="min-w-0">
          <p className="truncate text-xs text-neutral-400">
            {state.data.generatedAt
              ? `${new Date(state.data.generatedAt).toLocaleString("ko-KR")} 생성`
              : "저장된 기록 기준"}
          </p>
          {state.data.cached && (
            <p className="mt-0.5 text-xs text-[#5fd39a]">
              저장된 리포트를 불러왔어요
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void run(true)}
          className="min-h-11 shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-4 text-xs font-semibold text-white transition hover:bg-white/[0.12] active:scale-95"
        >
          새로 분석
        </button>
      </div>

      {state.warning && (
        <p
          role="status"
          className="mx-auto mt-4 max-w-2xl rounded-2xl border border-[#f2c879]/20 bg-[#f2c879]/[0.08] px-4 py-3 text-xs leading-5 text-[#f0d6a4] sm:mx-4 md:mx-auto"
        >
          {state.warning}
        </p>
      )}

      <AnalysisBody stats={state.data.analysis} report={state.data.report} />
    </div>
  );
}