// web/src/lib/regionHeat.ts
// 지구본 "관측" 화면: 남긴 장소를 행정구역(나라 → 도 → 시 → 구 → 동)별로 모아 셉니다.
// 경계: 통계청 SGIS 센서스용 행정구역경계(2013), 공공누리 제1유형. public/geo/*.json 으로 간소화해 둠.
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

export type HeatLevel = "country" | "sido" | "city" | "sgg" | "emd";

export const HEAT_LEVELS: Array<{
  id: HeatLevel;
  code: string;
  label: string;
  /** 이 단계가 보이기 시작하는 지구본 줌 */
  minZoom: number;
}> = [
  { id: "country", code: "COUNTRY", label: "나라", minZoom: 0 },
  { id: "sido", code: "PROVINCE", label: "도", minZoom: 4.6 },
  { id: "city", code: "CITY", label: "시", minZoom: 6.8 },
  { id: "sgg", code: "DISTRICT", label: "구", minZoom: 8.4 },
  { id: "emd", code: "DONG", label: "동", minZoom: 10 },
];

export function levelAtZoom(zoom: number): HeatLevel {
  let current: HeatLevel = "country";
  for (const level of HEAT_LEVELS) if (zoom >= level.minZoom) current = level.id;
  return current;
}

type Props = { k: string; n: string; c?: string; cn?: string };
type Geo = FeatureCollection<Polygon | MultiPolygon, Props>;

export type HeatPoint = { lat: number; lng: number };

/** 단계별 구역 키 → 방문 수 */
export type HeatCounts = Record<HeatLevel, Map<string, number>>;

export type HeatData = {
  sido: Geo;
  sgg: Geo;
  emd: Geo;
  counts: HeatCounts;
  /** 행정구역 안에 들어간 기록 수 (나라 단계의 값) */
  total: number;
};

let cache: Promise<{ sido: Geo; sgg: Geo; emd: Geo }> | null = null;

function loadBoundaries() {
  if (!cache) {
    const get = (name: string) =>
      fetch(`/geo/${name}.json`).then((res) => {
        if (!res.ok) throw new Error(`boundary_${name}_${res.status}`);
        return res.json() as Promise<Geo>;
      });
    cache = Promise.all([get("kr-sido"), get("kr-sgg"), get("kr-emd")])
      .then(([sido, sgg, emd]) => ({ sido, sgg, emd }))
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}

// ── 점이 어느 동 안에 있는지 ──────────────────

type Indexed = {
  key: string;
  bbox: [number, number, number, number];
  polygons: Position[][][];
};

function ringsOf(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function bboxOf(polygons: Position[][][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0] ?? []) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function inRing(x: number, y: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygons(x: number, y: number, polygons: Position[][][]) {
  for (const polygon of polygons) {
    if (!polygon[0] || !inRing(x, y, polygon[0])) continue;
    let hole = false;
    for (let h = 1; h < polygon.length; h += 1) {
      if (inRing(x, y, polygon[h])) {
        hole = true;
        break;
      }
    }
    if (!hole) return true;
  }
  return false;
}

/** 간소화된 경계라 해안선에서 살짝 벗어난 점은 가장 가까운 동으로 붙임 (약 1.5km 안) */
const SNAP_DEG = 0.015;

function findDong(index: Indexed[], lng: number, lat: number) {
  let nearest: Indexed | null = null;
  let nearestGap = Infinity;
  for (const item of index) {
    const [minX, minY, maxX, maxY] = item.bbox;
    if (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY) {
      if (inPolygons(lng, lat, item.polygons)) return item.key;
    }
    const gap = Math.max(minX - lng, lng - maxX, minY - lat, lat - maxY, 0);
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = item;
    }
  }
  return nearest && nearestGap <= SNAP_DEG ? nearest.key : null;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function buildHeat(points: HeatPoint[]): Promise<HeatData> {
  const { sido, sgg, emd } = await loadBoundaries();

  const index: Indexed[] = emd.features.map((feature) => {
    const polygons = ringsOf(feature.geometry);
    return { key: feature.properties.k, bbox: bboxOf(polygons), polygons };
  });
  const cityOf = new Map(
    sgg.features.map((f) => [f.properties.k, f.properties.c ?? f.properties.k]),
  );

  const counts: HeatCounts = {
    country: new Map(),
    sido: new Map(),
    city: new Map(),
    sgg: new Map(),
    emd: new Map(),
  };

  let total = 0;
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const dong = findDong(index, point.lng, point.lat);
    if (!dong) continue;
    total += 1;
    // 동 코드 7자리: 앞 2자리 = 시도, 앞 5자리 = 시군구
    const sggCode = dong.slice(0, 5);
    bump(counts.emd, dong);
    bump(counts.sgg, sggCode);
    bump(counts.city, cityOf.get(sggCode) ?? sggCode);
    bump(counts.sido, dong.slice(0, 2));
  }
  if (total > 0) counts.country.set("KR", total);

  return { sido, sgg, emd, counts, total };
}

/**
 * 방문 수 → 1~5 단계. 단계마다 가장 많이 머문 곳을 5로 두고 로그 척도로 나눔
 * (한두 번 들른 곳과 수십 번 머문 곳이 한눈에 구별되도록).
 */
export function heatClass(count: number, max: number) {
  if (count <= 0 || max <= 0) return 0;
  if (max === 1) return 3;
  return Math.max(1, Math.min(5, Math.ceil((5 * Math.log(count + 1)) / Math.log(max + 1))));
}

/** 지도 레이어용: 각 구역에 v(방문 수)·h(단계)·label 을 붙인 GeoJSON */
export function paintLevel(data: HeatData, level: HeatLevel): Geo {
  const source = level === "country" || level === "sido" ? data.sido : level === "emd" ? data.emd : data.sgg;
  const counts = data.counts[level];
  const max = Math.max(0, ...counts.values());

  const keyOf = (p: Props) =>
    level === "country" ? "KR" : level === "city" ? (p.c ?? p.k) : p.k;
  const labelOf = (p: Props) =>
    level === "country" ? "대한민국" : level === "city" ? (p.cn ?? p.n) : p.n;

  return {
    type: "FeatureCollection",
    features: source.features.map((feature) => {
      const key = keyOf(feature.properties);
      const v = counts.get(key) ?? 0;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          key,
          label: labelOf(feature.properties),
          v,
          h: heatClass(v, max),
        } as Props,
      };
    }),
  };
}

/** 범례: 단계별로 대략 몇 번부터인지 */
export function heatLegend(data: HeatData, level: HeatLevel) {
  const max = Math.max(0, ...data.counts[level].values());
  return { max, visited: data.counts[level].size };
}
