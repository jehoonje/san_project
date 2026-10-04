// web/src/types/place.ts
export const PLACE_CATEGORIES = [
  { key: "cafe", label: "카페", emoji: "☕" },
  { key: "restaurant", label: "식당", emoji: "🍽️" },
  { key: "bar", label: "술집", emoji: "🍺" },
  { key: "park", label: "공원", emoji: "🌳" },
  { key: "shop", label: "상점", emoji: "🛍️" },
  { key: "culture", label: "문화", emoji: "🎭" },
  { key: "etc", label: "기타", emoji: "📍" },
] as const;

export type PlaceCategory =
  (typeof PLACE_CATEGORIES)[number]["key"];

export type PlaceSource = "manual" | "auto_prompt";

// Record 지도와 My Route 지도에서 공통으로 사용하는 최소 장소 정보
export type PlaceMapItem = {
  id?: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
};

// 기록 중 메모리에 들고 있다가 루트 저장 시 함께 DB에 저장되는 장소
export type PlaceDraft = PlaceMapItem & {
  accuracyMeters: number | null;
  savedAt: string;
  source: PlaceSource;
  dwellMinutes: number | null;
  placeId: string | null;
  regionDong: string | null;
};

// route_places 테이블에서 조회한 장소
export type SavedPlace = PlaceMapItem & {
  id: string;
  accuracy_meters: number | null;
  dwell_minutes: number | null;
  source: PlaceSource;
  saved_at: string;
  created_at: string;
  place_id?: string | null;
  region_dong?: string | null;
};