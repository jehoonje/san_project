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
      <p className="san-eyebrow mb-3 flex items-center gap-2">
        <span className="san-dot" aria-hidden="true" />
        지금 여기
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.h1
          key={title}
          className="san-display"
          initial={{ opacity: 0, filter: reducedMotion ? "blur(0px)" : "blur(8px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: reducedMotion ? "blur(0px)" : "blur(6px)" }}
          transition={{
            duration: reducedMotion ? 0 : 0.5,
            ease: EASE_AMBIENT,
          }}
        >
          {title}
        </motion.h1>
      </AnimatePresence>

      {summary.localName && summary.localName !== summary.displayName && (
        <p className="mt-1.5 text-[13px] font-light text-san-text">
          {summary.localName}
        </p>
      )}

      <dl className="mt-7 grid grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dd className="m-0 font-mono text-[19px] font-light leading-none tracking-[-0.01em] tabular-nums text-san-text">
              {metric.value}
            </dd>
            <dt className="mt-2.5 text-[11.5px] leading-snug text-san-text">
              {metric.label}
            </dt>
          </div>
        ))}
      </dl>

      {(summary.countsError || summary.regionError) && (
        <p role="status" className="mt-4 text-[12px] text-san-text">
          {summary.countsError ?? summary.regionError}
        </p>
      )}
    </div>
  );
}
