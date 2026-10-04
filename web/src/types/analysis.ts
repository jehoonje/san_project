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
