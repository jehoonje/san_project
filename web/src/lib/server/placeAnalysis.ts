import { createHash } from "node:crypto";

import { makePlaceKey } from "@/lib/placeKey";
import { PLACE_CATEGORIES } from "@/types/place";

import type {
  KeywordStat,
  MissingInsightPlace,
  PlaceAnalysisStats,
  PlaceEvidence,
  PlaceEvidenceSummary,
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

const ANALYSIS_VERSION = "place-analysis-v2-evidence";

const MAX_EVIDENCE_PLACES = 40;

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(
    PLACE_CATEGORIES.map((category) => [
      category.key,
      category.label,
    ]),
  );

const TIME_LABELS: Record<string, string> = {
  dawn: "새벽",
  morning: "오전",
  afternoon: "오후",
  evening: "저녁",
  night: "밤",
};

function percent(
  count: number,
  total: number,
): number {
  return total > 0
    ? Math.round((count / total) * 100)
    : 0;
}

function increase(
  map: Map<string, number>,
  key: string,
  by = 1,
): void {
  map.set(key, (map.get(key) ?? 0) + by);
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
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.label.localeCompare(b.label),
    );
}

function topWords(
  counts: Map<string, number>,
  max = 8,
): KeywordStat[] {
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.label.localeCompare(b.label),
    )
    .slice(0, max);
}

function safeStrings(
  value: string[] | null | undefined,
): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanEvidenceStrings(
  value: string[] | null | undefined,
  max: number,
): string[] {
  return [
    ...new Set(
      safeStrings(value).map((item) =>
        item.slice(0, 80),
      ),
    ),
  ].slice(0, max);
}

function validTimestamp(
  value: string | null,
): number | null {
  if (!value) return null;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function kstParts(timestamp: number): {
  hour: number;
  day: number;
} {
  const shifted = new Date(
    timestamp + KST_OFFSET_MS,
  );

  return {
    hour: shifted.getUTCHours(),
    day: shifted.getUTCDay(),
  };
}

function timeSlot(hour: number): string {
  if (hour < 6) return "dawn";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";

  return "night";
}

function buildInsightIndex(
  insights: PlaceInsightRow[],
): Map<string, PlaceInsightRow> {
  const index = new Map<string, PlaceInsightRow>();

  for (const insight of insights) {
    const previous = index.get(insight.place_id);

    const currentTime =
      validTimestamp(insight.fetched_at) ?? 0;

    const previousTime = previous
      ? validTimestamp(previous.fetched_at) ?? 0
      : 0;

    if (!previous || currentTime > previousTime) {
      index.set(insight.place_id, insight);
    }
  }

  return index;
}

export function placeKeyOf(
  place: RoutePlaceRow,
): string {
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
  const existing = new Set(
    insights.map((insight) => insight.place_id),
  );

  const unique = new Map<
    string,
    MissingInsightPlace
  >();

  for (const place of places) {
    const placeId = placeKeyOf(place);

    if (
      existing.has(placeId) ||
      unique.has(placeId)
    ) {
      continue;
    }

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

function collectPlaceEvidence(
  places: RoutePlaceRow[],
  insightById: Map<string, PlaceInsightRow>,
): PlaceEvidenceSummary {
  const grouped = new Map<
    string,
    {
      row: RoutePlaceRow;
      recordCount: number;
      lastRecordedAt: number;
    }
  >();

  for (const place of places) {
    const placeId = placeKeyOf(place);

    const recordedAt =
      validTimestamp(place.saved_at) ?? 0;

    const existing = grouped.get(placeId);

    if (!existing) {
      grouped.set(placeId, {
        row: place,
        recordCount: 1,
        lastRecordedAt: recordedAt,
      });

      continue;
    }

    existing.recordCount += 1;

    if (recordedAt > existing.lastRecordedAt) {
      existing.row = place;
      existing.lastRecordedAt = recordedAt;
    }
  }

  const candidates: {
    evidence: PlaceEvidence;
    lastRecordedAt: number;
  }[] = [];

  for (const [placeId, group] of grouped) {
    const insight = insightById.get(placeId);

    if (!insight) continue;

    const keywords = cleanEvidenceStrings(
      insight.keywords,
      5,
    );

    const moods = cleanEvidenceStrings(
      insight.moods,
      3,
    );

    const signatureMenus = cleanEvidenceStrings(
      insight.signature_menus,
      3,
    );

    if (
      keywords.length === 0 &&
      moods.length === 0 &&
      signatureMenus.length === 0
    ) {
      continue;
    }

    candidates.push({
      evidence: {
        placeId,
        name: group.row.name.trim().slice(0, 100),
        category: group.row.category || "etc",
        regionDong:
          group.row.region_dong?.trim() || null,
        recordCount: group.recordCount,
        keywords,
        moods,
        signatureMenus,
        fetchedAt: insight.fetched_at,
      },
      lastRecordedAt: group.lastRecordedAt,
    });
  }

  candidates.sort(
    (a, b) =>
      b.evidence.recordCount -
        a.evidence.recordCount ||
      b.lastRecordedAt - a.lastRecordedAt ||
      a.evidence.placeId.localeCompare(
        b.evidence.placeId,
      ),
  );

  const selected = candidates
    .slice(0, MAX_EVIDENCE_PLACES)
    .map((item) => item.evidence);

  return {
    totalUniquePlaces: grouped.size,
    enrichedUniquePlaces: candidates.length,
    includedPlaces: selected.length,
    truncated: candidates.length > selected.length,
    places: selected,
  };
}

export function buildPlaceEvidence(
  places: RoutePlaceRow[],
  insights: PlaceInsightRow[],
): PlaceEvidenceSummary {
  return collectPlaceEvidence(
    places,
    buildInsightIndex(insights),
  );
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

  const insightById = buildInsightIndex(insights);

  const now = Date.now();

  let dwellTotal = 0;
  let dwellCount = 0;

  let weekdayVisits = 0;
  let weekendVisits = 0;

  let recentVisits30Days = 0;
  let previousVisits30Days = 0;

  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;

  for (const place of places) {
    const key = placeKeyOf(place);

    uniquePlaces.add(key);
    routeIds.add(place.route_id);

    increase(
      categoryCounts,
      place.category || "etc",
    );

    const region = place.region_dong?.trim();

    if (region) {
      increase(regionCounts, region);
    }

    const savedTimestamp = validTimestamp(
      place.saved_at,
    );

    if (savedTimestamp !== null) {
      const { hour, day } = kstParts(savedTimestamp);

      increase(timeCounts, timeSlot(hour));

      if (day === 0 || day === 6) {
        weekendVisits += 1;
      } else {
        weekdayVisits += 1;
      }

      const age = now - savedTimestamp;

      if (age >= 0 && age < THIRTY_DAYS_MS) {
        recentVisits30Days += 1;
      } else if (
        age >= THIRTY_DAYS_MS &&
        age < THIRTY_DAYS_MS * 2
      ) {
        previousVisits30Days += 1;
      }

      if (
        firstTimestamp === null ||
        savedTimestamp < firstTimestamp
      ) {
        firstTimestamp = savedTimestamp;
      }

      if (
        lastTimestamp === null ||
        savedTimestamp > lastTimestamp
      ) {
        lastTimestamp = savedTimestamp;
      }
    }

    if (
      typeof place.dwell_minutes === "number" &&
      Number.isFinite(place.dwell_minutes) &&
      place.dwell_minutes >= 0
    ) {
      dwellTotal += place.dwell_minutes;
      dwellCount += 1;
    }

    const insight = insightById.get(key);

    if (!insight) continue;

    // 同じ場所の複数記録はそれぞれ集計します。
    // 同じ配列内の重複語だけを除きます。
    for (
      const keyword of new Set(
        safeStrings(insight.keywords),
      )
    ) {
      increase(keywordCounts, keyword);
    }

    for (
      const mood of new Set(
        safeStrings(insight.moods),
      )
    ) {
      increase(moodCounts, mood);
    }

    for (
      const menu of new Set(
        safeStrings(insight.signature_menus),
      )
    ) {
      increase(menuCounts, menu);
    }
  }

  return {
    routeCount: routeIds.size,
    totalVisits: places.length,
    uniquePlaces: uniquePlaces.size,

    averageDwellMinutes:
      dwellCount > 0
        ? Math.round(dwellTotal / dwellCount)
        : null,

    weekdayVisits,
    weekendVisits,

    recentVisits30Days,
    previousVisits30Days,

    firstVisitAt:
      firstTimestamp === null
        ? null
        : new Date(firstTimestamp).toISOString(),

    lastVisitAt:
      lastTimestamp === null
        ? null
        : new Date(lastTimestamp).toISOString(),

    categories: ranked(
      categoryCounts,
      places.length,
      CATEGORY_LABELS,
    ),

    regions: ranked(
      regionCounts,
      places.length,
    ),

    timeSlots: ranked(
      timeCounts,
      places.length,
      TIME_LABELS,
    ),

    topKeywords: topWords(keywordCounts),
    topMoods: topWords(moodCounts),
    topMenus: topWords(menuCounts),

    placeEvidence: collectPlaceEvidence(
      places,
      insightById,
    ),
  };
}

export function analysisFingerprint(
  places: RoutePlaceRow[],
  insights: PlaceInsightRow[],
): string {
  const placeVersion = places
    .map((place) => ({
      id: place.id,
      routeId: place.route_id,
      placeKey: placeKeyOf(place),
      name: place.name,
      category: place.category,
      regionDong: place.region_dong,
      savedAt: place.saved_at,
      dwellMinutes: place.dwell_minutes,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const insightVersion = insights
    .map((insight) => ({
      placeId: insight.place_id,
      keywords: cleanEvidenceStrings(
        insight.keywords,
        5,
      ),
      moods: cleanEvidenceStrings(
        insight.moods,
        3,
      ),
      signatureMenus: cleanEvidenceStrings(
        insight.signature_menus,
        3,
      ),
      fetchedAt: insight.fetched_at,
    }))
    .sort((a, b) =>
      a.placeId.localeCompare(b.placeId),
    );

  return createHash("sha256")
    .update(
      JSON.stringify({
        version: ANALYSIS_VERSION,
        placeVersion,
        insightVersion,
      }),
    )
    .digest("hex");
}