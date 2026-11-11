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
  shortHash,
  type VisitMark,
} from "@/lib/routeLog";
import styles from "./RouteLog.module.css";

type RouteLogProps = {
  routes: SavedRoute[];
  onSelect: (route: SavedRoute) => void;
};

const REGION_CACHE_KEY = "san-region-cache-v1";
const REGION_CONCURRENCY = 3;
// 처음 화면을 채우는 줄까지만 순서대로 출력하는 연출, 그 뒤는 즉시
const STAGGER_ROWS = 36;
const STAGGER_S = 0.018;

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
  | { kind: "end"; route: SavedRoute; isHead: boolean }
  | { kind: "title"; route: SavedRoute; isHead: boolean }
  | {
      kind: "place";
      route: SavedRoute;
      place: SavedPlace;
      mark: VisitMark | undefined;
      cumulative: number | null;
    }
  | { kind: "start"; route: SavedRoute }
  | { kind: "gap"; route: SavedRoute };

function RegionText({ value }: { value: string | null | undefined }) {
  if (value === undefined) {
    return <span className={styles.pending}>···</span>;
  }
  return <>{value ?? "—"}</>;
}

export function RouteLog({ routes, onSelect }: RouteLogProps) {
  const reduceMotion = useReducedMotion();
  const regionOf = useEndpointRegions(routes);

  const { rows, stats } = useMemo(() => {
    const { marks, uniqueCount, totalCount } = computeVisitMarks(routes);
    const out: Row[] = [];
    let totalMeters = 0;

    routes.forEach((route, index) => {
      totalMeters += route.distance_meters ?? 0;
      const coords = (route.coordinates ?? []) as LngLat[];
      const places = [...(route.route_places ?? [])].sort(
        (a, b) =>
          new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime(),
      );

      out.push({ kind: "end", route, isHead: index === 0 });
      out.push({ kind: "title", route, isHead: index === 0 });
      for (const place of places) {
        out.push({
          kind: "place",
          route,
          place,
          mark: marks.get(place.id),
          cumulative: cumulativeDistanceTo(coords, [place.lng, place.lat]),
        });
      }
      out.push({ kind: "start", route });
      if (index < routes.length - 1) out.push({ kind: "gap", route });
    });

    return {
      rows: out,
      stats: {
        routes: routes.length,
        places: totalCount,
        unique: uniqueCount,
        meters: totalMeters,
      },
    };
  }, [routes]);

  function rowMotion(index: number) {
    if (reduceMotion) return {};
    const delay = index < STAGGER_ROWS ? 0.12 + index * STAGGER_S : 0;
    return {
      initial: { opacity: 0, x: -6, filter: "blur(3px)" },
      animate: { opacity: 1, x: 0, filter: "blur(0px)" },
      transition: { duration: 0.28, delay, ease: [0.16, 1, 0.3, 1] as const },
    };
  }

  return (
    <div
      className={styles.scroller}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)",
      }}
    >
      <div className={styles.log} role="list" aria-label="루트 기록 로그">
        <motion.p
          className={styles.prompt}
          aria-hidden="true"
          {...(reduceMotion
            ? {}
            : {
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                transition: { duration: 0.3 },
              })}
        >
          <span className={styles.promptPath}>~/san</span>
          <span className={styles.promptSign}>$</span> log --oneline --graph
        </motion.p>

        <p className={styles.summary}>
          <span>
            <b>{stats.routes}</b> routes
          </span>
          <span className={styles.sep}>·</span>
          <span>
            <b>{stats.unique}</b> places collected
          </span>
          <span className={styles.sep}>·</span>
          <span>
            <b>{formatKm(stats.meters)}</b>
          </span>
        </p>

        {rows.map((row, index) => {
          const key = `${row.kind}-${row.route.id}-${
            row.kind === "place" ? row.place.id : ""
          }`;
          const open = () => onSelect(row.route);
          const coords = (row.route.coordinates ?? []) as LngLat[];

          if (row.kind === "gap") {
            return (
              <div key={key} className={styles.gap} aria-hidden="true">
                <span className={styles.railFaint} />
              </div>
            );
          }

          if (row.kind === "title") {
            return (
              <motion.button
                key={key}
                type="button"
                role="listitem"
                onClick={open}
                className={`${styles.row} ${styles.titleRow}`}
                {...rowMotion(index)}
              >
                <span className={styles.graph} aria-hidden="true">
                  <span className={styles.rail} />
                </span>
                <span className={styles.comment}>
                  <span className={styles.hashMark}>#</span> {row.route.title}
                </span>
                {row.isHead && <span className={styles.head}>HEAD</span>}
              </motion.button>
            );
          }

          if (row.kind === "end") {
            const end = coords[coords.length - 1];
            return (
                <motion.button
                  key={key}
                  type="button"
                  role="listitem"
                  onClick={open}
                  className={`${styles.row} ${styles.endRow}`}
                  aria-label={`${row.route.title} 루트 열기`}
                  {...rowMotion(index)}
                >
                  <span className={styles.graph} aria-hidden="true">
                    <span className={styles.railLower} />
                    <span className={styles.nodeEnd} />
                  </span>
                  <span className={styles.hash}>
                    {shortHash(row.route.id)}
                  </span>
                  <span className={styles.date}>
                    {formatLogDate(row.route.ended_at)}
                  </span>
                  <span className={styles.time}>
                    {formatLogTime(row.route.ended_at)}
                  </span>
                  <span className={styles.region}>
                    <RegionText value={regionOf(end)} />
                  </span>
                  <span className={styles.num}>
                    {formatKm(row.route.distance_meters)}
                  </span>
                  <span className={styles.numDim}>
                    {formatDuration(row.route.duration_seconds)}
                  </span>
                </motion.button>
            );
          }

          if (row.kind === "start") {
            const start = coords[0];
            return (
              <motion.button
                key={key}
                type="button"
                role="listitem"
                onClick={open}
                className={`${styles.row} ${styles.startRow}`}
                {...rowMotion(index)}
              >
                <span className={styles.graph} aria-hidden="true">
                  <span className={styles.railUpper} />
                  <span className={styles.nodeStart} />
                </span>
                <span className={styles.startTag}>start</span>
                <span className={styles.date}>
                  {formatLogDate(row.route.started_at)}
                </span>
                <span className={styles.time}>
                  {formatLogTime(row.route.started_at)}
                </span>
                <span className={styles.region}>
                  <RegionText value={regionOf(start)} />
                </span>
                <span className={styles.numDim}>0.0km</span>
              </motion.button>
            );
          }

          const { place, mark, cumulative } = row;
          return (
            <motion.button
              key={key}
              type="button"
              role="listitem"
              onClick={open}
              className={`${styles.row} ${styles.placeRow}`}
              data-category={place.category}
              aria-label={`${place.name}, ${categoryLabel(place.category)}`}
              {...rowMotion(index)}
            >
              <span className={styles.graph} aria-hidden="true">
                <span className={styles.rail} />
                <span className={styles.nodePlace} />
              </span>
              <span className={styles.time}>
                {formatLogTime(place.saved_at)}
              </span>
              <span className={styles.name}>{place.name}</span>
              <span className={styles.cat}>
                {categoryLabel(place.category)}
              </span>
              {mark &&
                (mark.isNew ? (
                  <span className={styles.badgeNew}>new</span>
                ) : (
                  <span className={styles.badge}>×{mark.nth}</span>
                ))}
              <span className={styles.region}>{place.region_dong ?? "—"}</span>
              <span className={styles.num}>
                {cumulative == null ? "" : `+${formatKm(cumulative)}`}
              </span>
            </motion.button>
          );
        })}

        <p className={styles.eof} aria-hidden="true">
          <span className={styles.promptPath}>~/san</span>
          <span className={styles.promptSign}>$</span>
          <span className={styles.cursor} />
        </p>
      </div>
    </div>
  );
}
