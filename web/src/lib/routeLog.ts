// web/src/lib/routeLog.ts
// My Route 목록형(로그) 뷰에서 쓰는 순수 계산 함수들
import { haversineMeters, type LngLat } from "@/lib/geo";
import type { SavedPlace } from "@/types/place";
import type { SavedRoute } from "@/types/route";

export type VisitMark = { nth: number; isNew: boolean };

export function placeKey(place: Pick<SavedPlace, "place_id" | "name">) {
  return place.place_id
    ? `id:${place.place_id}`
    : `name:${place.name.trim().toLowerCase()}`;
}

function savedTime(place: SavedPlace) {
  return new Date(place.saved_at ?? place.created_at).getTime();
}

// 전체 기록을 시간순으로 훑으며 장소별 몇 번째 방문인지 계산 (첫 방문 = new)
export function computeVisitMarks(routes: SavedRoute[]) {
  const all = routes
    .flatMap((route) => route.route_places ?? [])
    .sort((a, b) => savedTime(a) - savedTime(b));

  const counts = new Map<string, number>();
  const marks = new Map<string, VisitMark>();

  for (const place of all) {
    const key = placeKey(place);
    const nth = (counts.get(key) ?? 0) + 1;
    counts.set(key, nth);
    marks.set(place.id, { nth, isNew: nth === 1 });
  }

  return { marks, uniqueCount: counts.size, totalCount: all.length };
}

// 루트 시작점부터 장소에 가장 가까운 좌표까지의 누적 이동거리(m)
export function cumulativeDistanceTo(
  coordinates: LngLat[],
  target: LngLat,
) {
  if (coordinates.length === 0) return null;

  let nearestIndex = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < coordinates.length; i++) {
    const d = haversineMeters(coordinates[i], target);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIndex = i;
    }
  }

  let total = 0;
  for (let i = 1; i <= nearestIndex; i++) {
    total += haversineMeters(coordinates[i - 1], coordinates[i]);
  }
  return total;
}

export function formatKm(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters)) return "–.–km";
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function formatLogDate(value: string | null | undefined) {
  if (!value) return "--.-- ---";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--.-- ---";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd} ${WEEKDAYS[d.getDay()]}`;
}

export function formatLogTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function shortHash(id: string) {
  return id.replace(/-/g, "").slice(0, 7);
}
