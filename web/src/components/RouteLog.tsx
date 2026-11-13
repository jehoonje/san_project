"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/types/place";
import type { SavedPlace } from "@/types/place";
import type { SavedRoute } from "@/types/route";
import type { LngLat } from "@/lib/geo";
import {
  computeVisitMarks,
  cumulativeDistanceTo,
  formatDuration,
  formatKm,
  formatLogDate,
  formatLogTime,
  type VisitMark,
} from "@/lib/routeLog";
import type { ReactNode } from "react";
import type { DayNote } from "@/lib/dayNotes";
import styles from "./RouteLog.module.css";

type RouteLogProps = {
  routes: SavedRoute[];
  onSelect: (route: SavedRoute) => void;
  /** 걷지 않은 날 한 줄 (날짜 내림차순) */
  dayNotes?: DayNote[];
  onSelectDay?: (day: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
};

const REGION_CACHE_KEY = "san-region-cache-v1";
const REGION_CONCURRENCY = 3;
// 처음 화면을 채우는 줄까지만 차례로 떠오르는 연출, 그 뒤는 즉시
const STAGGER_ROWS = 28;
const STAGGER_S = 0.028;

function categoryLabel(category: PlaceCategory) {
  return (
    PLACE_CATEGORIES.find((c) => c.key === category)?.label ?? "기타"
  );
}

function coordKey([lng, lat]: LngLat) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function readRegionCache(): Record<string, string | null> {
  try {
    return JSON.parse(sessionStorage.getItem(REGION_CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeRegionCache(cache: Record<string, string | null>) {
  try {
    sessionStorage.setItem(REGION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장 실패는 무시 (다음에 다시 조회)
  }
}

// 루트 시작·종료 지점의 행정동을 조회. 세션 캐시 + 동시 요청 제한
function useEndpointRegions(routes: SavedRoute[]) {
  const [regions, setRegions] = useState<Record<string, string | null>>(
    {},
  );

  const points = useMemo(() => {
    const unique = new Map<string, LngLat>();
    for (const route of routes) {
      const coords = route.coordinates ?? [];
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first) unique.set(coordKey(first), first);
      if (last) unique.set(coordKey(last), last);
    }
    return [...unique.entries()];
  }, [routes]);

  useEffect(() => {
    let cancelled = false;
    const cache = readRegionCache();
    const pending = points.filter(([key]) => !(key in cache));

    queueMicrotask(() => {
      if (!cancelled) setRegions({ ...cache });
    });

    async function worker() {
      while (!cancelled && pending.length) {
        const next = pending.shift();
        if (!next) return;
        const [key, [lng, lat]] = next;
        try {
          const res = await fetch(
            `/api/region-dong?lat=${lat}&lng=${lng}`,
          );
          const json = res.ok ? await res.json() : null;
          cache[key] = json?.regionDong ?? null;
        } catch {
          continue;
        }
        if (cancelled) return;
        writeRegionCache(cache);
        setRegions((prev) => ({ ...prev, [key]: cache[key] }));
      }
    }

    for (let i = 0; i < REGION_CONCURRENCY; i++) void worker();
    return () => {
      cancelled = true;
    };
  }, [points]);

  return (point: LngLat | undefined) => {
    if (!point) return null;
    const key = coordKey(point);
    return key in regions ? regions[key] : undefined;
  };
}

type Row =
  | { kind: "end"; route: SavedRoute; isLatest: boolean }
  | {
      kind: "place";
      route: SavedRoute;
      place: SavedPlace;
      mark: VisitMark | undefined;
      cumulative: number | null;
    }
  | { kind: "start"; route: SavedRoute; isLast: boolean }
  | { kind: "note"; note: DayNote; isLast: boolean };

function Region({ value }: { value: string | null | undefined }) {
  if (value === undefined) return <span className={styles.pending}>…</span>;
  return <>{value ?? "—"}</>;
}

export function RouteLog({
  routes,
  onSelect,
  dayNotes = [],
  onSelectDay,
  header,
  footer,
}: RouteLogProps) {
  const reduceMotion = useReducedMotion();
  const regionOf = useEndpointRegions(routes);

  const { rows, stats } = useMemo(() => {
    const { marks, uniqueCount } = computeVisitMarks(routes);
    const out: Row[] = [];
    let totalMeters = 0;

    // 걸은 날과 걷지 않은 날을 한 흐름으로 섞습니다 (둘 다 최신순)
    const notes = [...dayNotes].sort((a, b) => b.day.localeCompare(a.day));
    let noteIndex = 0;
    const dayOf = (route: SavedRoute) =>
      new Date(
        new Date(route.started_at ?? route.created_at).getTime() + 9 * 3600 * 1000,
      )
        .toISOString()
        .slice(0, 10);
    /** day 보다 나중(또는 같은) 날의 한 줄을 먼저 내보냅니다 */
    const flushNotes = (day: string | null, includeSameDay = false) => {
      while (
        noteIndex < notes.length &&
        (day === null ||
          notes[noteIndex].day > day ||
          (includeSameDay && notes[noteIndex].day === day))
      ) {
        const note = notes[noteIndex];
        noteIndex += 1;
        out.push({
          kind: "note",
          note,
          isLast: noteIndex >= notes.length && routes.length === 0,
        });
      }
    };

    routes.forEach((route, index) => {
      flushNotes(dayOf(route));
      totalMeters += route.distance_meters ?? 0;
      const coords = (route.coordinates ?? []) as LngLat[];
      const places = [...(route.route_places ?? [])].sort(
        (a, b) =>
          new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime(),
      );

      out.push({ kind: "end", route, isLatest: index === 0 });
      for (const place of places) {
        out.push({
          kind: "place",
          route,
          place,
          mark: marks.get(place.id),
          cumulative: cumulativeDistanceTo(coords, [place.lng, place.lat]),
        });
      }
      out.push({
        kind: "start",
        route,
        isLast: index === routes.length - 1 && noteIndex >= notes.length,
      });
      // 같은 날에 한 줄도 남겼다면 그 루트 바로 뒤에
      flushNotes(dayOf(route), true);
    });
    flushNotes(null);

    return {
      rows: out,
      stats: {
        routes: routes.length,
        unique: uniqueCount,
        meters: totalMeters,
      },
    };
  }, [routes, dayNotes]);

  function rowMotion(index: number) {
    if (reduceMotion) return {};
    const delay = index < STAGGER_ROWS ? 0.08 + index * STAGGER_S : 0;
    return {
      initial: { opacity: 0, y: 4, filter: "blur(6px)" },
      animate: { opacity: 1, y: 0, filter: "blur(0px)" },
      transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
    };
  }

  return (
    <div
      className={styles.scroller}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)",
      }}
    >
      {header}

      <div className={styles.log}>
        <p className={styles.summary}>
          {stats.routes} routes <span className={styles.dot}>·</span>{" "}
          {stats.unique} places <span className={styles.dot}>·</span>{" "}
          {formatKm(stats.meters)}
        </p>

        <ol className={styles.list} aria-label="루트 기록">
          {rows.map((row, index) => {
            if (row.kind === "note") {
              return (
                <motion.li
                  key={`note-${row.note.day}`}
                  className={row.isLast ? undefined : styles.routeEnd}
                  {...rowMotion(index)}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDay?.(row.note.day)}
                    className={`${styles.line} ${styles.noteLine}`}
                    aria-label={`${row.note.day} 한 줄`}
                  >
                    <span className={styles.lead}>
                      {formatLogDate(`${row.note.day}T12:00:00+09:00`)}
                    </span>
                    <span className={styles.main}>
                      <span className={styles.note}>{row.note.body}</span>
                    </span>
                    <span className={styles.meta}>—</span>
                  </button>
                </motion.li>
              );
            }

            const open = () => onSelect(row.route);
            const coords = (row.route.coordinates ?? []) as LngLat[];

            if (row.kind === "end") {
              return (
                <motion.li key={`end-${row.route.id}`} {...rowMotion(index)}>
                  <button
                    type="button"
                    onClick={open}
                    className={`${styles.line} ${styles.endLine} ${
                      row.isLatest ? styles.latest : ""
                    }`}
                    aria-label={`${row.route.title} 루트 열기`}
                  >
                    <span className={styles.lead}>
                      {formatLogDate(row.route.ended_at)}
                    </span>
                    <span className={styles.main}>
                      <span className={styles.clock}>
                        {formatLogTime(row.route.ended_at)}
                      </span>
                      <span className={styles.region}>
                        <Region value={regionOf(coords[coords.length - 1])} />
                      </span>
                    </span>
                    <span className={styles.meta}>
                      {formatKm(row.route.distance_meters)}
                      <span className={styles.faint}>
                        {formatDuration(row.route.duration_seconds)}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            }

            if (row.kind === "start") {
              return (
                <motion.li
                  key={`start-${row.route.id}`}
                  className={row.isLast ? undefined : styles.routeEnd}
                  {...rowMotion(index)}
                >
                  <button
                    type="button"
                    onClick={open}
                    className={`${styles.line} ${styles.startLine}`}
                  >
                    <span className={styles.lead}>
                      {formatLogDate(row.route.started_at)}
                    </span>
                    <span className={styles.main}>
                      <span className={styles.clock}>
                        {formatLogTime(row.route.started_at)}
                      </span>
                      <span className={styles.region}>
                        <Region value={regionOf(coords[0])} />
                      </span>
                    </span>
                    <span className={styles.meta}>0.0km</span>
                  </button>
                </motion.li>
              );
            }

            const { place, mark, cumulative } = row;
            return (
              <motion.li key={`place-${place.id}`} {...rowMotion(index)}>
                <button
                  type="button"
                  onClick={open}
                  className={`${styles.line} ${styles.placeLine}`}
                  aria-label={`${place.name}, ${categoryLabel(place.category)}`}
                >
                  <span className={`${styles.lead} ${styles.leadTime}`}>
                    {formatLogTime(place.saved_at)}
                  </span>
                  <span className={styles.main}>
                    <span className={styles.name}>{place.name}</span>
                    {mark?.isNew && <span className={styles.new}>new</span>}
                    <span className={styles.faint}>
                      {categoryLabel(place.category)}
                    </span>
                    <span className={styles.region}>
                      {place.region_dong ?? ""}
                    </span>
                  </span>
                  <span className={styles.meta}>
                    {cumulative == null ? "" : `+${formatKm(cumulative)}`}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ol>
      </div>

      {footer}
    </div>
  );
}
