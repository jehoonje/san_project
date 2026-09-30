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

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]["key"];

export type PlaceSource = "manual" | "auto_prompt";

// 기록 중 메모리에 들고 있다가 루트 저장 시 함께 DB에 저장되는 장소
export type PlaceDraft = {
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  savedAt: string;
  source: PlaceSource;
  dwellMinutes: number | null;
};