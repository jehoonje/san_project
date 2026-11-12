export type RankedStat = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type KeywordStat = {
  label: string;
  count: number;
};

/**
 * 하나의 장소에 연결된 분석 근거입니다.
 *
 * recordCount는 저장 기록 수이며,
 * 실제 방문 횟수나 재방문 여부를 의미하지 않습니다.
 */
export type PlaceEvidence = {
  placeId: string;
  name: string;
  category: string;
  regionDong: string | null;

  recordCount: number;

  keywords: string[];
  moods: string[];
  signatureMenus: string[];

  fetchedAt: string | null;
};

/**
 * 장소별 근거의 전달 범위를 나타냅니다.
 */
export type PlaceEvidenceSummary = {
  /**
   * 전체 저장 기록에서 구분되는 서로 다른 장소 수.
   */
  totalUniquePlaces: number;

  /**
   * 하나 이상의 유효한 키워드·분위기·메뉴 정보가 있는
   * 서로 다른 장소 수.
   */
  enrichedUniquePlaces: number;

  /**
   * 분석 입력에 실제 포함한 장소 수.
   */
  includedPlaces: number;

  /**
   * 입력 크기 제한으로 일부 장소가 생략되었는지 여부.
   */
  truncated: boolean;

  places: PlaceEvidence[];
};

export type PlaceAnalysisStats = {
  routeCount: number;
  totalVisits: number;
  uniquePlaces: number;

  averageDwellMinutes: number | null;

  weekdayVisits: number;
  weekendVisits: number;

  recentVisits30Days: number;
  previousVisits30Days: number;

  firstVisitAt: string | null;
  lastVisitAt: string | null;

  categories: RankedStat[];
  regions: RankedStat[];
  timeSlots: RankedStat[];

  topKeywords: KeywordStat[];
  topMoods: KeywordStat[];
  topMenus: KeywordStat[];

  /**
   * 이전 캐시와의 호환성을 위해 선택 필드로 유지합니다.
   * 업데이트된 analyzePlaces()는 항상 반환합니다.
   */
  placeEvidence?: PlaceEvidenceSummary;
};

export type PersonalReport = {
  title: string;
  summary: string;
  identity: string;

  categoryPreference: string;
  areaPreference: string;
  timePattern: string;

  moodAndSpending: string;
  favoriteMenus: string;

  recommendations: string[];
  caveat: string;
};

export type MissingInsightPlace = {
  placeId: string;
  name: string;
  category: string;
  regionDong: string | null;
  lat: number;
  lng: number;
};

export type AnalysisReportResponse = {
  status: "ready" | "needs_enrichment";

  analysis: PlaceAnalysisStats;
  report: PersonalReport | null;

  generatedAt: string | null;
  cached: boolean;

  missingPlaces: MissingInsightPlace[];
};