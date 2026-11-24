// web/src/lib/places/types.ts
// 주변 장소 검색 결과: 어느 서비스에서 왔든 같은 모양으로 돌려줍니다.
import type { PlaceCategory } from "@/types/place";

export type NearbyPlace = {
  /** 서비스를 가리는 접두어를 붙인 식별자 (카카오는 숫자 그대로, OSM은 osm:node/123) */
  providerId: string;
  name: string;
  category: PlaceCategory;
  categoryName: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  address: string;
  phone: string | null;
  placeUrl: string;
};

/**
 * 대한민국 언저리의 거친 경계 상자.
 * 카카오 로컬 API는 한국 안만 찾으므로 이 안에서만 먼저 부릅니다.
 * 상자는 일본 규슈 북부 등도 걸치므로, 결과가 없으면 다른 서비스로 넘어갑니다.
 */
export function inKoreaBounds(lat: number, lng: number) {
  return lat >= 32.9 && lat <= 38.8 && lng >= 124.5 && lng <= 132.0;
}
