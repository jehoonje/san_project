import type {
  PlaceEvidence,
  PlaceEvidenceSummary,
} from "@/types/analysis";

export type TraitGroup =
  | "music"
  | "interior"
  | "seating"
  | "menu"
  | "atmosphere";

export type TraitSource =
  | "keywords"
  | "moods"
  | "signatureMenus";

type TraitRule = {
  key: string;
  label: string;
  group: TraitGroup;
  sources: readonly TraitSource[];
  aliases: readonly string[];
};

export type TraitPlace = {
  placeId: string;
  name: string;
  regionDong: string | null;
  rawTerms: string[];
};

export type NormalizedPlaceTrait = {
  key: string;
  label: string;
  group: TraitGroup;
  source: TraitSource;
  rawTerms: string[];
};

export type PlaceTraitPattern = {
  key: string;
  label: string;
  group: TraitGroup;

  count: number;
  eligibleCount: number;
  percent: number;

  places: TraitPlace[];
};

export type PlaceTraitResult = {
  patterns: PlaceTraitPattern[];

  includedPlaces: number;
  enrichedUniquePlaces: number;
  totalUniquePlaces: number;

  truncated: boolean;
};

export const TRAIT_GROUP_LABELS: Record<
  TraitGroup,
  string
> = {
  music: "음악",
  interior: "인테리어",
  seating: "좌석·공간",
  menu: "대표 메뉴",
  atmosphere: "분위기",
};

/**
 * 전체 표현을 정규화해서 비교합니다.
 * 부분 문자열만으로 특징을 추정하지 않습니다.
 */
function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s·ㆍ_-]+/g, "");
}

const RULES: readonly TraitRule[] = [
  {
    key: "music.record",
    label: "레코드",
    group: "music",
    sources: ["keywords"],
    aliases: [
      "LP",
      "레코드",
      "바이닐",
      "vinyl",
      "LP 카페",
      "레코드 카페",
      "바이닐 카페",
      "LP 음악",
      "레코드 음악",
      "LP 감상",
      "레코드 감상",
      "LP 음악 감상",
    ],
  },
  {
    key: "music.jazz",
    label: "재즈",
    group: "music",
    sources: ["keywords"],
    aliases: [
      "재즈",
      "jazz",
      "재즈 음악",
      "재즈 카페",
      "재즈 바",
      "재즈바",
    ],
  },
  {
    key: "music.live",
    label: "라이브 음악",
    group: "music",
    sources: ["keywords"],
    aliases: [
      "라이브 음악",
      "라이브 공연",
      "라이브 연주",
      "라이브 뮤직",
      "live music",
    ],
  },
  {
    key: "interior.wood",
    label: "목재 인테리어",
    group: "interior",
    sources: ["keywords"],
    aliases: [
      "목재",
      "우드",
      "원목",
      "목재 인테리어",
      "우드 인테리어",
      "원목 인테리어",
      "우드톤",
      "우드톤 인테리어",
    ],
  },
  {
    key: "interior.exposed_concrete",
    label: "노출 콘크리트",
    group: "interior",
    sources: ["keywords"],
    aliases: [
      "노출 콘크리트",
      "노출콘크리트",
      "콘크리트 인테리어",
      "노출 콘크리트 인테리어",
    ],
  },
  {
    key: "interior.vintage",
    label: "빈티지 공간",
    group: "interior",
    sources: ["keywords", "moods"],
    aliases: [
      "빈티지",
      "vintage",
      "빈티지 인테리어",
      "빈티지 가구",
      "빈티지 공간",
    ],
  },
  {
    key: "interior.minimal",
    label: "미니멀한 공간",
    group: "interior",
    sources: ["keywords", "moods"],
    aliases: [
      "미니멀",
      "minimal",
      "미니멀리즘",
      "미니멀 인테리어",
      "미니멀한 공간",
    ],
  },
  {
    key: "seating.bar",
    label: "바 좌석",
    group: "seating",
    sources: ["keywords"],
    aliases: [
      "바 좌석",
      "바좌석",
      "카운터 좌석",
      "카운터석",
      "바 테이블 좌석",
    ],
  },
  {
    key: "seating.terrace",
    label: "테라스",
    group: "seating",
    sources: ["keywords"],
    aliases: [
      "테라스",
      "테라스 좌석",
      "야외 테라스",
    ],
  },
  {
    key: "seating.rooftop",
    label: "루프톱",
    group: "seating",
    sources: ["keywords"],
    aliases: [
      "루프탑",
      "루프톱",
      "옥상 좌석",
      "루프탑 좌석",
      "루프톱 좌석",
    ],
  },
  {
    key: "seating.small_space",
    label: "작은 공간",
    group: "seating",
    sources: ["keywords"],
    aliases: [
      "작은 공간",
      "작은 매장",
      "소규모 공간",
      "소규모 매장",
      "아담한 공간",
      "아담한 매장",
    ],
  },
  {
    key: "menu.hand_drip",
    label: "핸드드립",
    group: "menu",
    sources: ["signatureMenus"],
    aliases: [
      "핸드드립",
      "핸드 드립",
      "핸드드립 커피",
      "드립 커피",
      "드립커피",
      "필터 커피",
      "필터커피",
      "브루잉 커피",
    ],
  },
  {
    key: "menu.pudding",
    label: "푸딩",
    group: "menu",
    sources: ["signatureMenus"],
    aliases: [
      "푸딩",
      "커스터드 푸딩",
      "커스터드푸딩",
      "카라멜 푸딩",
      "캐러멜 푸딩",
    ],
  },
  {
    key: "menu.natural_wine",
    label: "내추럴 와인",
    group: "menu",
    sources: ["signatureMenus"],
    aliases: [
      "내추럴 와인",
      "내츄럴 와인",
      "내추럴와인",
      "내츄럴와인",
      "natural wine",
    ],
  },
  {
    key: "atmosphere.calm",
    label: "차분한 분위기",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "calm",
      "차분한",
      "차분한 분위기",
    ],
  },
  {
    key: "atmosphere.cozy",
    label: "아늑한 분위기",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "cozy",
      "아늑한",
      "아늑한 분위기",
    ],
  },
  {
    key: "atmosphere.lively",
    label: "활기찬 분위기",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "lively",
      "활기찬",
      "활기찬 분위기",
    ],
  },
  {
    key: "atmosphere.trendy",
    label: "트렌디한 분위기",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "trendy",
      "트렌디한",
      "트렌디한 분위기",
    ],
  },
  {
    key: "atmosphere.romantic",
    label: "로맨틱한 분위기",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "romantic",
      "로맨틱",
      "로맨틱한 분위기",
    ],
  },
  {
    key: "atmosphere.family",
    label: "가족 친화적인 공간",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "family",
      "가족 친화적",
      "가족 친화적인 공간",
    ],
  },
  {
    key: "atmosphere.work_friendly",
    label: "작업하기 좋은 공간",
    group: "atmosphere",
    sources: ["moods"],
    aliases: [
      "work_friendly",
      "작업하기 좋은",
      "작업하기 좋은 공간",
    ],
  },
];

// 취향 컬렉션(도감)의 칸: 규칙에 등록된 모든 특징
export const TRAIT_CATALOG: readonly {
  key: string;
  label: string;
  group: TraitGroup;
}[] = RULES.map(({ key, label, group }) => ({ key, label, group }));

const SOURCES: readonly TraitSource[] = [
  "keywords",
  "moods",
  "signatureMenus",
];

const ruleIndex = new Map<string, TraitRule>();

const ruleByKey = new Map<string, TraitRule>(
  RULES.map((rule) => [rule.key, rule]),
);

for (const rule of RULES) {
  for (const source of rule.sources) {
    for (const alias of rule.aliases) {
      ruleIndex.set(
        `${source}:${normalizeText(alias)}`,
        rule,
      );
    }
  }
}

function sourceValues(
  place: PlaceEvidence,
  source: TraitSource,
): string[] {
  const values = place[source];

  if (!Array.isArray(values)) return [];

  return values
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0,
    )
    .map((value) => value.trim());
}

export function normalizePlaceTraits(
  place: PlaceEvidence,
): NormalizedPlaceTrait[] {
  const normalized = new Map<
    string,
    NormalizedPlaceTrait
  >();

  for (const source of SOURCES) {
    const values = sourceValues(place, source);

    for (const raw of values) {
      const rule = ruleIndex.get(
        `${source}:${normalizeText(raw)}`,
      );

      // 등록되지 않은 표현은 추측으로 분류하지 않습니다.
      if (!rule) continue;

      const key = `${rule.key}:${source}`;
      const existing = normalized.get(key);

      if (existing) {
        if (!existing.rawTerms.includes(raw)) {
          existing.rawTerms.push(raw);
        }
      } else {
        normalized.set(key, {
          key: rule.key,
          label: rule.label,
          group: rule.group,
          source,
          rawTerms: [raw],
        });
      }
    }
  }

  return [...normalized.values()];
}

export function buildPlaceTraitPatterns(
  summary?: PlaceEvidenceSummary,
): PlaceTraitResult {
  if (!summary) {
    return {
      patterns: [],
      includedPlaces: 0,
      enrichedUniquePlaces: 0,
      totalUniquePlaces: 0,
      truncated: false,
    };
  }

  const places = [
    ...new Map(
      summary.places.map((place) => [
        place.placeId,
        place,
      ]),
    ).values(),
  ];

  const grouped = new Map<
    string,
    {
      rule: TraitRule;
      places: Map<string, TraitPlace>;
    }
  >();

  for (const place of places) {
    const normalized = normalizePlaceTraits(place);

    for (const trait of normalized) {
      const rule = ruleByKey.get(trait.key);

      if (!rule) continue;

      let group = grouped.get(trait.key);

      if (!group) {
        group = {
          rule,
          places: new Map<string, TraitPlace>(),
        };

        grouped.set(trait.key, group);
      }

      const previous = group.places.get(
        place.placeId,
      );

      if (previous) {
        previous.rawTerms = [
          ...new Set([
            ...previous.rawTerms,
            ...trait.rawTerms,
          ]),
        ];
      } else {
        group.places.set(place.placeId, {
          placeId: place.placeId,
          name: place.name,
          regionDong: place.regionDong,
          rawTerms: [...trait.rawTerms],
        });
      }
    }
  }

  const patterns: PlaceTraitPattern[] = [];

  for (const [key, group] of grouped) {
    const count = group.places.size;

    // 서로 다른 장소 두 곳 이상에서 확인된 특징만 표시합니다.
    if (count < 2) continue;

    const eligibleCount = places.filter(
      (place) =>
        group.rule.sources.some(
          (source) =>
            sourceValues(place, source).length > 0,
        ),
    ).length;

    if (eligibleCount === 0) continue;

    patterns.push({
      key,
      label: group.rule.label,
      group: group.rule.group,
      count,
      eligibleCount,
      percent:
        Math.round(
          (count / eligibleCount) * 1000,
        ) / 10,
      places: [...group.places.values()],
    });
  }

  patterns.sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label),
  );

  return {
    patterns,
    includedPlaces: places.length,
    enrichedUniquePlaces:
      summary.enrichedUniquePlaces,
    totalUniquePlaces:
      summary.totalUniquePlaces,
    truncated: summary.truncated,
  };
}