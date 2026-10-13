"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { RegionSummary } from "@/hooks/useRegionSummary";

type RegionOverviewProps = {
  summary: RegionSummary;
};

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatCount(
  value: number | null,
  loading: boolean,
  unit?: string,
) {
  if (loading) return "…";
  if (value === null) return "—";
  const formatted = numberFormatter.format(value);
  return unit ? `${formatted}${unit}` : formatted;
}

export function RegionOverview({ summary }: RegionOverviewProps) {
  const reducedMotion = Boolean(useReducedMotion());

  const title = summary.regionLoading ? "지역 확인 중" : summary.displayName;

  const metrics = [
    {
      label: "이곳에 모인 사람",
      value: formatCount(summary.totalRoutes, summary.countsLoading, " "),
    },
    {
      label: "내가 담아둔 루트",
      value: formatCount(summary.myRoutes, summary.countsLoading, " "),
    },
    {
      label: "현재 기온",
      value: summary.regionLoading
        ? "…"
        : summary.temperature === null
          ? "—"
          : `${summary.temperature}°`,
    },
  ];

  return (
    <div className="w-full text-white">
      <p className="mb-2 text-xs font-medium tracking-[0.12em] text-neutral-400">
        지금 여기는
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.h1
          key={title}
          className="break-words text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl"
          initial={{ opacity: reducedMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          {title}
        </motion.h1>
      </AnimatePresence>

      {summary.localName && summary.localName !== summary.displayName && (
        <p className="mt-1 text-sm text-neutral-400">{summary.localName}</p>
      )}

      <dl className="mt-6 grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-xs leading-relaxed text-neutral-400">
              {metric.label}
            </dt>
            <dd className="mt-2 text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      {summary.countsError && (
        <p role="status" className="mt-3 text-xs text-neutral-400">
          {summary.countsError}
        </p>
      )}

      {summary.regionError && (
        <p role="status" className="mt-3 text-xs text-neutral-400">
          {summary.regionError}
        </p>
      )}

      {!summary.regionLoading &&
        !summary.regionError &&
        summary.temperature === null && (
          <p className="mt-3 text-xs text-neutral-400">
            지금 기온은 잠시 확인하기 어려워요.
          </p>
        )}
    </div>
  );
}
