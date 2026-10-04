import { createHash } from "node:crypto";
import { makePlaceKey } from "@/lib/placeKey";
import { PLACE_CATEGORIES } from "@/types/place";
import type {
  KeywordStat,
  MissingInsightPlace,
  PlaceAnalysisStats,
  RankedStat,
} from "@/types/analysis";

export type RoutePlaceRow = {
  id: string;
  route_id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  dwell_minutes: number | null;
  saved_at: string;
  place_id: string | null;
  region_dong: string | null;
};

export type PlaceInsightRow = {
  place_id: string;
  keywords: string[] | null;
  moods: string[] | null;
  signature_menus: string[] | null;
  fetched_at: string | null;
};

const CATEGORY_LABELS = Object.fromEntries(
  PLACE_CATEGORIES.map((category) => [category.key, category.label]),
);

const TIME_LABELS: Record<string, string> = {
  dawn: "새벽",
  morning: "오전",
  afternoon: "오후",
  evening: "저녁",
  night: "밤",
};

function percent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function ranked(
  counts: Map<string, number>,
  total: number,
  labels: Record<string, string> = {},
): RankedStat[] {
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: labels[key] ?? key,
      count,
      percent: percent(count, total),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function topWords(counts: Map<string, number>, max = 8): KeywordStat[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, max);
}

function increase(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function kstParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return {
    hour: shifted.getUTCHours(),
    day: shifted.getUTCDay(),
  };
}

function timeSlot(hour: number) {
  if (hour < 6) return "dawn";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function safeStrings(value: string[] | null) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

export function placeKeyOf(place: RoutePlaceRow) {
  return makePlaceKey({
    providerId: place.place_id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
  });
}

export function findMissingInsights(
  places: RoutePlaceRow[],
  insights: PlaceInsightRow[],
): MissingInsightPlace[] {
  const existing = new Set(insights.map((insight) => insight.place_id));
  const unique = new Map<string, MissingInsightPlace>();

  for (const place of places) {
    const placeId = placeKeyOf(place);
    if (existing.has(placeId) || unique.has(placeId)) continue;

    unique.set(placeId, {
      placeId,
      name: place.name,
      category: place.category,
      regionDong: place.region_dong,
      lat: place.lat,
      lng: place.lng,
    });
  }

  return [...unique.values()];
}

export function analyzePlaces(
  places: RoutePlaceRow[],
  insights: PlaceInsightRow[],
): PlaceAnalysisStats {
  const categoryCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const timeCounts = new Map<string, number>();
  const keywordCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();
  const menuCounts = new Map<string, number>();
  const uniquePlaces = new Set<string>();
  const routeIds = new Set<string>();
  const dwellValues: number[] = [];
  const insightById = new Map(
    insights.map((insight) => [insight.place_id, insight]),
  );
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  let weekdayVisits = 0;
  let weekendVisits = 0;
  let recentVisits30Days = 0;
  let previousVisits30Days = 0;

  for (const place of places) {
    const key = placeKeyOf(place);
    uniquePlaces.add(key);
    routeIds.add(place.route_id);
    increase(categoryCounts, place.category || "etc");

    if (place.region_dong?.trim()) {
      increase(regionCounts, place.region_dong.trim());
    }

    const { hour, day } = kstParts(place.saved_at);
    increase(timeCounts, timeSlot(hour));
    if (day === 0 || day === 6) weekendVisits += 1;
    else weekdayVisits += 1;

    const savedTime = new Date(place.saved_at).getTime();
    const age = now - savedTime;
    if (age >= 0 && age < thirtyDays) recentVisits30Days += 1;
    else if (age >= thirtyDays && age < thirtyDays * 2) {
      previousVisits30Days += 1;
    }

    if (
      typeof place.dwell_minutes === "number" &&
      Number.isFinite(place.dwell_minutes) &&
      place.dwell_minutes >= 0
    ) {
      dwellValues.push(place.dwell_minutes);
    }

    const insight = insightById.get(key);
    if (insight) {
      for (const keyword of safeStrings(insight.keywords)) {
        increase(keywordCounts, keyword);
      }
      for (const mood of safeStrings(insight.moods)) {
        increase(moodCounts, mood);
      }
      for (const menu of safeStrings(insight.signature_menus)) {
        increase(menuCounts, menu);
      }
    }
  }

  const timestamps = places
    .map((place) => new Date(place.saved_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  return {
    routeCount: routeIds.size,
    totalVisits: places.length,
    uniquePlaces: uniquePlaces.size,
    averageDwellMinutes:
      dwellValues.length > 0
        ? Math.round(
            dwellValues.reduce((sum, value) => sum + value, 0) /
              dwellValues.length,
          )
        : null,
    weekdayVisits,
    weekendVisits,
    recentVisits30Days,
    previousVisits30Days,
    firstVisitAt:
      timestamps.length > 0
        ? new Date(timestamps[0]).toISOString()
        : null,
    lastVisitAt:
      timestamps.length > 0
        ? new Date(timestamps[timestamps.length - 1]).toISOString()
        : null,
    categories: ranked(categoryCounts, places.length, CATEGORY_LABELS),
    regions: ranked(regionCounts, places.length),
    timeSlots: ranked(timeCounts, places.length, TIME_LABELS),
    topKeywords: topWords(keywordCounts),
    topMoods: topWords(moodCounts),
    topMenus: topWords(menuCounts),
  };
}

export function analysisFingerprint(
  places: RoutePlaceRow[],
  insights: PlaceInsightRow[],
) {
  const placeVersion = places
    .map((place) => [place.id, place.category, place.region_dong, place.saved_at])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const insightVersion = insights
    .map((insight) => [insight.place_id, insight.fetched_at])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return createHash("sha256")
    .update(JSON.stringify({ placeVersion, insightVersion }))
    .digest("hex");
}
