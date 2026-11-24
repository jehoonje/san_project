// web/src/lib/places/osmClient.ts
// 서버에서만 쓰는 OpenStreetMap 조회: 해외(또는 카카오가 못 찾는 곳)의 장소와 동네 이름.
// 키가 필요 없는 공개 서버를 쓰므로 예의를 지킵니다: 결과를 잠시 기억하고,
// 역지오코딩은 초당 한 번 이하로 줄을 세우며, 요청에는 개인 정보가 없는 앱 이름만 답니다.
import { buildOverpassQuery, parseNominatimRegion, parseOverpass } from "./osm";
import type { NearbyPlace } from "./types";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "san-walk-app/1.0";

const PLACE_TTL_MS = 10 * 60 * 1000;
const REGION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 400;
const NOMINATIM_GAP_MS = 1100;

type Cached<T> = { at: number; value: T };

function remember<T>(cache: Map<string, Cached<T>>, key: string, value: T) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

function recall<T>(cache: Map<string, Cached<T>>, key: string, ttl: number) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

const placeCache = new Map<string, Cached<NearbyPlace[]>>();
const regionCache = new Map<string, Cached<string | null>>();

/** 이 반경 안의 이름 있는 장소들 (가까운 순). 모든 서버가 실패하면 던집니다. */
export async function searchPlacesOsm(
  lat: number,
  lng: number,
  radius: number,
  limit: number,
): Promise<NearbyPlace[]> {
  // 약 11m 격자로 묶어 같은 자리의 반복 요청은 기억해 둔 것을 씁니다
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
  const cached = recall(placeCache, key, PLACE_TTL_MS);
  if (cached) return cached;

  const body = new URLSearchParams({ data: buildOverpassQuery(lat, lng, radius) });
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);

      const places = parseOverpass(await response.json(), lat, lng, radius, limit);
      remember(placeCache, key, places);
      return places;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Overpass 실패");
}

// 공개 Nominatim은 초당 1회가 한도라, 모든 요청을 한 줄로 세웁니다.
let nominatimTail: Promise<unknown> = Promise.resolve();

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimTail.then(task, task);
  nominatimTail = run
    .catch(() => undefined)
    .then(() => new Promise((resolve) => setTimeout(resolve, NOMINATIM_GAP_MS)));
  return run;
}

/** 좌표의 동네 이름 하나 (예: 시부야, Le Marais). 찾지 못하면 null */
export async function regionNameOsm(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = recall(regionCache, key, REGION_TTL_MS);
  if (cached !== undefined) return cached;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "ko,en");

  try {
    const name = await throttled(async () => {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Nominatim ${response.status}`);
      return parseNominatimRegion(await response.json());
    });
    remember(regionCache, key, name);
    return name;
  } catch (error) {
    console.error("[REGION] Nominatim 조회 실패:", error);
    return null;
  }
}
