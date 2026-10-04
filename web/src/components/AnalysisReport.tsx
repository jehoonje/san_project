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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function RankedBars({ items }: { items: RankedStat[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">표시할 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700">{item.label}</span>
            <span className="text-neutral-400">
              {item.count}회 · {item.percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-[#ff5a36] transition-all"
              style={{ width: `${Math.max(item.percent, 3)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
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
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-neutral-900">{title}</h2>
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
      <div className="rounded-2xl bg-neutral-900 p-5 text-white shadow-sm">
        <p className="text-xs text-white/60">Gemini 취향 리포트</p>
        <h2 className="mt-1 text-xl font-semibold">{report.title}</h2>
        <p className="mt-3 text-sm leading-6 text-white/80">{report.summary}</p>
      </div>

      <Section title="상세 분석">
        <div className="space-y-4">
          {paragraphs.map(([label, value]) => (
            <div key={label}>
              <h3 className="text-sm font-semibold text-neutral-800">{label}</h3>
              <p className="mt-1 text-sm leading-6 text-neutral-600">
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
                className="rounded-xl bg-neutral-50 px-3 py-2 text-sm leading-5 text-neutral-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.caveat && (
        <p className="px-1 text-xs leading-5 text-neutral-400">{report.caveat}</p>
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
        <div className="text-4xl">📍</div>
        <h2 className="mt-4 text-base font-semibold text-neutral-900">
          아직 분석할 장소가 없어요
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          루트를 기록하면서 장소를 저장하면 카테고리, 지역, 시간대 취향을
          분석해 드립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 pb-10">
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
        <p className="mt-4 text-xs text-neutral-400">
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
                className="rounded-full bg-[#fff1ed] px-3 py-1.5 text-xs font-medium text-[#e84928]"
              >
                {item.label} · {item.count}
              </span>
            ))}
            {stats.topMoods.map((item) => (
              <span
                key={`mood-${item.label}`}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600"
              >
                {MOOD_LABELS[item.label] ?? item.label} · {item.count}
              </span>
            ))}
            {stats.topMenus.map((item) => (
              <span
                key={`menu-${item.label}`}
                className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
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
  const [state, setState] = useState<LoadState>({
    status: "loading",
    message: "방문 기록을 분석하는 중...",
    current: 0,
    total: 0,
  });

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    }),
    [accessToken],
  );

  const enrichPlace = useCallback(
    async (place: MissingInsightPlace) => {
      const response = await fetch("/api/place-insight", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(place),
      });
      return parseResponse(response);
    },
    [headers],
  );

  const run = useCallback(
    async (force = false) => {
      setState({
        status: "loading",
        message: "방문 기록을 분석하는 중...",
        current: 0,
        total: 0,
      });

      try {
        const firstResponse = await fetch("/api/analysis-report", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ force }),
        });
        const first = (await parseResponse(
          firstResponse,
        )) as AnalysisReportResponse;

        let warning: string | null = null;
        if (first.status === "needs_enrichment") {
          let completed = 0;
          let limitReached = false;

          for (const place of first.missingPlaces) {
            setState({
              status: "loading",
              message: `장소 정보를 확인하는 중 (${completed + 1}/${first.missingPlaces.length})`,
              current: completed,
              total: first.missingPlaces.length,
            });

            try {
              await enrichPlace(place);
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

          if (limitReached) {
            warning =
              "이번 달 검색 한도에 도달해 저장된 정보만으로 리포트를 만들었습니다.";
          }

          setState({
            status: "loading",
            message: "개인 취향 리포트를 작성하는 중...",
            current: completed,
            total: first.missingPlaces.length,
          });

          const finalResponse = await fetch("/api/analysis-report", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ force, allowPartial: true }),
          });
          const final = (await parseResponse(
            finalResponse,
          )) as AnalysisReportResponse;

          setState({ status: "ready", data: final, warning });
          return;
        }

        setState({ status: "ready", data: first, warning: null });
      } catch (error) {
        console.error("분석 리포트 로드 실패:", error);
        setState({
          status: "error",
          message: "분석 리포트를 불러오지 못했습니다.",
        });
      }
    },
    [enrichPlace, headers],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  if (state.status === "loading") {
    const progress =
      state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;

    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[#ff5a36]" />
        <p className="mt-4 text-sm font-medium text-neutral-700">{state.message}</p>
        {state.total > 0 && (
          <div className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-[#ff5a36] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          처음 한 번은 장소 검색 때문에 시간이 걸릴 수 있어요.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-red-500">{state.message}</p>
        <button
          onClick={() => void run(false)}
          className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-50">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-2 backdrop-blur">
        <div>
          <p className="text-xs text-neutral-500">
            {state.data.generatedAt
              ? `${new Date(state.data.generatedAt).toLocaleString("ko-KR")} 생성`
              : "저장된 기록 기준"}
          </p>
          {state.data.cached && (
            <p className="text-[11px] text-green-600">저장된 리포트를 불러왔어요</p>
          )}
        </div>
        <button
          onClick={() => void run(true)}
          className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
        >
          새로 분석
        </button>
      </div>

      {state.warning && (
        <p className="mx-4 mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {state.warning}
        </p>
      )}

      <AnalysisBody stats={state.data.analysis} report={state.data.report} />
    </div>
  );
}
