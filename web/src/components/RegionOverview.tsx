"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { EASE_AMBIENT } from "@/lib/motion";
import type { RegionSummary } from "@/hooks/useRegionSummary";

type RegionOverviewProps = {
  summary: RegionSummary;
};

const numberFormatter = new Intl.NumberFormat("ko-KR");

function formatCount(value: number | null, loading: boolean, unit?: string) {
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
      value: formatCount(summary.totalRoutes, summary.countsLoading, "명"),
    },
    {
      label: "내가 담아둔 루트",
      value: formatCount(summary.myRoutes, summary.countsLoading, "개"),
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
    <div className="w-full pb-2 text-san-text">
      <p className="san-eyebrow mb-1">지금 여기</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.h1
          key={title}
          className="san-t1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reducedMotion ? 0 : 0.5,
            ease: EASE_AMBIENT,
          }}
        >
          {title}
        </motion.h1>
      </AnimatePresence>

      {summary.localName && summary.localName !== summary.displayName && (
        <p className="san-t3 mt-0.5">
          {summary.localName}
        </p>
      )}

      <dl className="mt-5 grid grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dd className="m-0 text-[15px] tabular-nums text-san-text">
              {metric.value}
            </dd>
            <dt className="san-t3 mt-0.5">
              {metric.label}
            </dt>
          </div>
        ))}
      </dl>

      {(summary.countsError || summary.regionError) && (
        <p role="status" className="san-t3 mt-4">
          {summary.countsError ?? summary.regionError}
        </p>
      )}
    </div>
  );
}
