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

export type PlaceMapItem = {
  id?: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
};

export type PlaceDraft = PlaceMapItem & {
  accuracyMeters: number | null;
  savedAt: string;
  source: PlaceSource;
  dwellMinutes: number | null;
  placeId: string | null;
  regionDong: string | null;
};

export type SavedPlace = PlaceMapItem & {
  id: string;
  accuracy_meters: number | null;
  dwell_minutes: number | null;
  source: PlaceSource;
  saved_at: string;
  created_at: string;
  place_id: string | null;
  region_dong: string | null;
};
