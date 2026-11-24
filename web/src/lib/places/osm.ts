// web/src/lib/places/osm.ts
// OpenStreetMap 기반 장소·지역 조회의 순수 부분 (질의 만들기, 응답 해석).
// 네트워크를 부르지 않아서 서버·테스트 어디서든 같은 결과를 냅니다.
// 데이터 © OpenStreetMap contributors (ODbL)
import type { PlaceCategory } from "@/types/place";
import type { NearbyPlace } from "./types";

type Tags = Record<string, string | undefined>;

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
};

const FOOD = "cafe|restaurant|fast_food|food_court|ice_cream";
const NIGHT = "bar|pub|biergarten|nightclub";
const CULTURE_AMENITY = "cinema|theatre|arts_centre|library|community_centre";
const TOURISM = "museum|gallery|attraction|viewpoint|artwork|zoo|aquarium|theme_park";
const LEISURE = "park|garden|playground|nature_reserve";

/** 반경 안의 이름 있는 장소들을 한 번에 묻는 Overpass 질의 */
export function buildOverpassQuery(lat: number, lng: number, radius: number) {
  const around = `(around:${Math.round(radius)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const named = (filter: string) => `nwr${around}${filter}["name"];`;
  return [
    "[out:json][timeout:8];",
    "(",
    named(`["amenity"~"^(${FOOD}|${NIGHT}|${CULTURE_AMENITY})$"]`),
    named(`["shop"]`),
    named(`["tourism"~"^(${TOURISM})$"]`),
    named(`["leisure"~"^(${LEISURE})$"]`),
    ");",
    "out center 80;",
  ].join("");
}

function categoryOf(tags: Tags): { category: PlaceCategory; label: string } | null {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const tourism = tags.tourism;
  const leisure = tags.leisure;

  if (amenity === "cafe") return { category: "cafe", label: "cafe" };
  if (amenity && new RegExp(`^(${FOOD})$`).test(amenity)) {
    return { category: "restaurant", label: amenity };
  }
  if (amenity && new RegExp(`^(${NIGHT})$`).test(amenity)) {
    return { category: "bar", label: amenity };
  }
  if (leisure && new RegExp(`^(${LEISURE})$`).test(leisure)) {
    return { category: "park", label: leisure };
  }
  if (amenity && new RegExp(`^(${CULTURE_AMENITY})$`).test(amenity)) {
    return { category: "culture", label: amenity };
  }
  if (tourism === "museum" || tourism === "gallery") {
    return { category: "culture", label: tourism };
  }
  if (tourism && new RegExp(`^(${TOURISM})$`).test(tourism)) {
    return { category: "etc", label: tourism };
  }
  if (shop) return { category: "shop", label: shop };
  return null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function addressOf(tags: Tags) {
  if (tags["addr:full"]) return tags["addr:full"] as string;
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const city = tags["addr:city"];
  return [city, street, number].filter(Boolean).join(" ");
}

/** 한국어 이름이 있으면 그것을, 없으면 간판에 적힌 현지 이름을 씁니다 */
function nameOf(tags: Tags) {
  return (tags["name:ko"] || tags.name || tags["name:en"] || "").trim();
}

/** Overpass 응답을 가까운 순 장소 목록으로 */
export function parseOverpass(
  data: unknown,
  lat: number,
  lng: number,
  radius: number,
  limit: number,
): NearbyPlace[] {
  const elements = (data as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const seen = new Set<string>();
  const places: NearbyPlace[] = [];

  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = nameOf(tags);
    const kind = categoryOf(tags);
    const pLat = element.lat ?? element.center?.lat;
    const pLng = element.lon ?? element.center?.lon;
    if (!name || !kind || !Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;

    const distance = haversine(lat, lng, pLat as number, pLng as number);
    if (distance > radius) continue;

    const id = `osm:${element.type}/${element.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    places.push({
      providerId: id,
      name,
      category: kind.category,
      categoryName: kind.label,
      lat: pLat as number,
      lng: pLng as number,
      distanceMeters: Math.round(distance),
      address: addressOf(tags),
      phone: tags.phone || tags["contact:phone"] || null,
      placeUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    });
  }

  return places
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

const REGION_KEYS = [
  "suburb",
  "neighbourhood",
  "quarter",
  "city_district",
  "borough",
  "town",
  "village",
  "municipality",
  "city",
  "county",
] as const;

/** Nominatim 역지오코딩 응답에서 동네 단위 이름 하나를 고릅니다 */
export function parseNominatimRegion(data: unknown): string | null {
  const address = (data as { address?: Record<string, string> } | null)?.address;
  if (!address) return null;
  for (const key of REGION_KEYS) {
    const value = address[key]?.trim();
    if (value) return value.slice(0, 40);
  }
  return null;
}
