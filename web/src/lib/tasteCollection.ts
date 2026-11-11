// web/src/lib/tasteCollection.ts
// 취향 컬렉션(도감): 기록한 장소에서 발견한 카테고리·특징을 "모으는" 단위로 정리합니다.
import {
  normalizePlaceTraits,
  TRAIT_CATALOG,
  type TraitGroup,
} from "@/lib/placeTraits";
import { PLACE_CATEGORIES } from "@/types/place";
import type { PlaceAnalysisStats } from "@/types/analysis";

export type DexGroup = "category" | TraitGroup;

export type DexPlace = {
  placeId: string;
  name: string;
  regionDong: string | null;
};

export type DexEntry = {
  key: string;
  label: string;
  group: DexGroup;
  /** 카테고리는 저장 횟수, 특징은 발견된 서로 다른 장소 수 */
  count: number;
  places: DexPlace[];
  unlocked: boolean;
};

export type DexGroupInfo = {
  group: DexGroup;
  code: string;
  label: string;
  hint: string;
  entries: DexEntry[];
};

export type Collection = {
  entries: DexEntry[];
  groups: DexGroupInfo[];
  unlocked: number;
  total: number;
  strongest: DexEntry | null;
};

// 바깥 궤도에 놓이는 순서 (카테고리는 안쪽 궤도)
export const GROUP_ORDER: DexGroup[] = [
  "category",
  "atmosphere",
  "music",
  "interior",
  "seating",
  "menu",
];

const GROUP_META: Record<DexGroup, { code: string; label: string; hint: string }> =
  {
    category: {
      code: "PLACE",
      label: "장소",
      hint: "새로운 종류의 장소를 남기면 열려요",
    },
    atmosphere: {
      code: "AIR",
      label: "분위기",
      hint: "공기의 결이 다른 곳에서 발견돼요",
    },
    music: {
      code: "SOUND",
      label: "음악",
      hint: "음악이 흐르는 곳에서 발견돼요",
    },
    interior: {
      code: "SPACE",
      label: "공간",
      hint: "공간의 소재와 결에서 발견돼요",
    },
    seating: {
      code: "SEAT",
      label: "자리",
      hint: "앉는 자리에서 발견돼요",
    },
    menu: {
      code: "TASTE",
      label: "메뉴",
      hint: "대표 메뉴에서 발견돼요",
    },
  };

export function groupMeta(group: DexGroup) {
  return GROUP_META[group];
}

// "기타"는 무엇이든 담기는 칸이라 수집 대상에서 제외
const COLLECTIBLE_CATEGORIES = PLACE_CATEGORIES.filter((c) => c.key !== "etc");

const CATALOG_LABELS = new Map<string, string>([
  ...COLLECTIBLE_CATEGORIES.map(
    (c) => [`category.${c.key}`, c.label] as [string, string],
  ),
  ...TRAIT_CATALOG.map((t) => [t.key, t.label] as [string, string]),
]);

export function dexLabel(key: string) {
  return CATALOG_LABELS.get(key) ?? null;
}

export function buildCollection(stats: PlaceAnalysisStats | null): Collection {
  const evidence = stats?.placeEvidence?.places ?? [];

  // 특징: 장소 한 곳에서라도 확인되면 열림 (분석 문장과 달리 수집은 1곳부터)
  const traitPlaces = new Map<string, Map<string, DexPlace>>();
  for (const place of evidence) {
    for (const trait of normalizePlaceTraits(place)) {
      let bucket = traitPlaces.get(trait.key);
      if (!bucket) {
        bucket = new Map();
        traitPlaces.set(trait.key, bucket);
      }
      bucket.set(place.placeId, {
        placeId: place.placeId,
        name: place.name,
        regionDong: place.regionDong,
      });
    }
  }

  const categoryCounts = new Map(
    (stats?.categories ?? []).map((c) => [c.key, c.count]),
  );

  const entries: DexEntry[] = [
    ...COLLECTIBLE_CATEGORIES.map((c) => {
      const places = evidence
        .filter((p) => p.category === c.key)
        .map((p) => ({
          placeId: p.placeId,
          name: p.name,
          regionDong: p.regionDong,
        }));
      const count = categoryCounts.get(c.key) ?? 0;
      return {
        key: `category.${c.key}`,
        label: c.label,
        group: "category" as const,
        count,
        places,
        unlocked: count > 0,
      };
    }),
    ...TRAIT_CATALOG.map((t) => {
      const places = [...(traitPlaces.get(t.key)?.values() ?? [])];
      return {
        key: t.key,
        label: t.label,
        group: t.group,
        count: places.length,
        places,
        unlocked: places.length > 0,
      };
    }),
  ];

  const groups = GROUP_ORDER.map((group) => ({
    group,
    ...GROUP_META[group],
    entries: entries.filter((e) => e.group === group),
  }));

  const unlockedTraits = entries
    .filter((e) => e.unlocked && e.group !== "category")
    .sort((a, b) => b.count - a.count);
  const unlockedCategories = entries
    .filter((e) => e.unlocked && e.group === "category")
    .sort((a, b) => b.count - a.count);

  return {
    entries,
    groups,
    unlocked: entries.filter((e) => e.unlocked).length,
    total: entries.length,
    strongest: unlockedTraits[0] ?? unlockedCategories[0] ?? null,
  };
}

// 받침 유무로 을/를 선택
function objectParticle(word: string) {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "를";
  return (last - 0xac00) % 28 === 0 ? "를" : "을";
}

// AI 이름이 아직 없을 때 쓰는 즉석 이름
export function fallbackTitle(collection: Collection) {
  const trait = collection.entries
    .filter((e) => e.unlocked && e.group !== "category")
    .sort((a, b) => b.count - a.count)[0];
  const category = collection.entries
    .filter((e) => e.unlocked && e.group === "category")
    .sort((a, b) => b.count - a.count)[0];

  if (trait && category) {
    return `${trait.label}${objectParticle(trait.label)} 모으는 ${category.label} 산책자`;
  }
  if (category) return `${category.label}${objectParticle(category.label)} 모으는 산책자`;
  return "아직 이름 없는 취향";
}

// ── 신호(근처 산책자)와 주고받는 취향 카드 ─────────────────

export type TasteCard = {
  /** 취향 이름 */
  t: string;
  /** 열린 칸의 키 (많이 모은 순, 최대 10개) */
  k: string[];
  /** 모은 칸 수 */
  n: number;
};

export function buildTasteCard(
  collection: Collection,
  title: string | null | undefined,
): TasteCard {
  const keys = collection.entries
    .filter((e) => e.unlocked)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => e.key);

  return {
    t: (title?.trim() || fallbackTitle(collection)).slice(0, 40),
    k: keys,
    n: collection.unlocked,
  };
}

// 두 카드의 취향 일치도 (Dice 계수) 와 공통 칸
export function compareCards(a: TasteCard | null, b: TasteCard | null) {
  if (!a || !b || a.k.length === 0 || b.k.length === 0) {
    return { percent: 0, common: [] as string[] };
  }
  const mine = new Set(a.k);
  const commonKeys = b.k.filter((key) => mine.has(key));
  const percent = Math.round(
    ((2 * commonKeys.length) / (a.k.length + b.k.length)) * 100,
  );
  return {
    percent,
    common: commonKeys
      .map((key) => dexLabel(key))
      .filter((label): label is string => Boolean(label)),
  };
}

export function sanitizeCard(value: unknown): TasteCard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = typeof raw.t === "string" ? raw.t.trim().slice(0, 40) : "";
  const keys = Array.isArray(raw.k)
    ? raw.k
        .filter((k): k is string => typeof k === "string" && dexLabel(k) !== null)
        .slice(0, 10)
    : [];
  const n =
    typeof raw.n === "number" && Number.isFinite(raw.n)
      ? Math.max(0, Math.min(99, Math.round(raw.n)))
      : keys.length;
  if (!title) return null;
  return { t: title, k: keys, n };
}
