// web/src/lib/routeStore.ts
// 경로 저장소: 로그인 사용자는 Supabase, 게스트는 이 기기(localStorage).
// 화면 쪽은 누가 쓰는지 신경 쓰지 않고 같은 함수만 부릅니다.
import { supabase } from "@/lib/supabaseClient";
import type { PlaceDraft, SavedPlace } from "@/types/place";
import type { SavedRoute } from "@/types/route";

export type RouteOwner = { kind: "user"; userId: string } | { kind: "guest" };

export type NewRoute = {
  title: string;
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  places: PlaceDraft[];
};

const GUEST_ROUTES_KEY = "san-guest-routes-v1";
const MAX_GUEST_ROUTES = 40;
const EVENT = "san-routes-change";

function readGuestRoutes(): SavedRoute[] {
  try {
    const raw = window.localStorage.getItem(GUEST_ROUTES_KEY);
    const list = raw ? (JSON.parse(raw) as SavedRoute[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeGuestRoutes(list: SavedRoute[]) {
  window.localStorage.setItem(
    GUEST_ROUTES_KEY,
    JSON.stringify(list.slice(0, MAX_GUEST_ROUTES)),
  );
}

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onRoutesChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function guestRouteCount() {
  return typeof window === "undefined" ? 0 : readGuestRoutes().length;
}

function toSavedPlace(place: PlaceDraft, now: string): SavedPlace {
  return {
    id: crypto.randomUUID(),
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    accuracy_meters: place.accuracyMeters,
    dwell_minutes: place.dwellMinutes,
    source: place.source,
    saved_at: place.savedAt,
    created_at: now,
    place_id: place.placeId,
    region_dong: place.regionDong,
  };
}

function toRpcPlace(place: PlaceDraft | SavedPlace) {
  const draft = "accuracyMeters" in place;
  return {
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    accuracy_meters: draft ? place.accuracyMeters : place.accuracy_meters,
    dwell_minutes: draft ? place.dwellMinutes : place.dwell_minutes,
    source: place.source,
    saved_at: draft ? place.savedAt : place.saved_at,
    place_id: draft ? place.placeId : place.place_id,
    region_dong: draft ? place.regionDong : place.region_dong,
  };
}

export async function listRoutes(owner: RouteOwner): Promise<SavedRoute[]> {
  if (owner.kind === "guest") return readGuestRoutes();

  const { data, error } = await supabase
    .from("routes")
    .select(
      `
      id, title, coordinates, distance_meters, duration_seconds,
      started_at, ended_at, created_at,
      route_places (
        id, name, category, lat, lng, accuracy_meters,
        dwell_minutes, source, saved_at, created_at, place_id, region_dong
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as SavedRoute[];
}

export async function saveRoute(owner: RouteOwner, route: NewRoute) {
  if (owner.kind === "guest") {
    const now = new Date().toISOString();
    const saved: SavedRoute = {
      id: crypto.randomUUID(),
      title: route.title,
      coordinates: route.coordinates,
      distance_meters: route.distanceMeters,
      duration_seconds: route.durationSeconds,
      started_at: route.startedAt,
      ended_at: route.endedAt,
      created_at: now,
      route_places: route.places.map((place) => toSavedPlace(place, now)),
    };
    writeGuestRoutes([saved, ...readGuestRoutes()]);
    notify();
    return;
  }

  const { error } = await supabase.rpc("save_route_with_places", {
    p_title: route.title,
    p_coordinates: route.coordinates,
    p_distance_meters: route.distanceMeters,
    p_duration_seconds: route.durationSeconds,
    p_started_at: route.startedAt,
    p_ended_at: route.endedAt,
    p_places: route.places.map(toRpcPlace),
  });

  if (error) throw error;
  notify();
}

/** 수정 대상이 없으면 false */
export async function renameRoute(owner: RouteOwner, id: string, title: string) {
  if (owner.kind === "guest") {
    const list = readGuestRoutes();
    if (!list.some((route) => route.id === id)) return false;
    writeGuestRoutes(
      list.map((route) => (route.id === id ? { ...route, title } : route)),
    );
    return true;
  }

  const { data, error } = await supabase
    .from("routes")
    .update({ title })
    .eq("id", id)
    .select("id");

  if (error) throw error;
  return Boolean(data?.length);
}

/** 삭제 대상이 없으면 false */
export async function deleteRoute(owner: RouteOwner, id: string) {
  if (owner.kind === "guest") {
    const list = readGuestRoutes();
    if (!list.some((route) => route.id === id)) return false;
    writeGuestRoutes(list.filter((route) => route.id !== id));
    return true;
  }

  const { data, error } = await supabase
    .from("routes")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;
  return Boolean(data?.length);
}

/**
 * 게스트로 남긴 기록을 로그인한 계정으로 옮깁니다.
 * 성공한 것만 기기에서 지우고, 옮긴 개수를 돌려줍니다.
 */
export async function importGuestRoutes(): Promise<number> {
  const pending = readGuestRoutes();
  if (pending.length === 0) return 0;

  let moved = 0;
  const remaining: SavedRoute[] = [];

  // 오래된 것부터 옮겨 목록 순서를 유지
  for (const route of [...pending].reverse()) {
    const { error } = await supabase.rpc("save_route_with_places", {
      p_title: route.title,
      p_coordinates: route.coordinates,
      p_distance_meters: route.distance_meters ?? 0,
      p_duration_seconds: route.duration_seconds ?? 0,
      p_started_at: route.started_at,
      p_ended_at: route.ended_at,
      p_places: (route.route_places ?? []).map(toRpcPlace),
    });

    if (error) {
      console.error("게스트 기록 옮기기 실패:", error);
      remaining.unshift(route);
    } else {
      moved += 1;
    }
  }

  try {
    writeGuestRoutes(remaining);
  } catch {
    // 무시
  }
  if (moved > 0) notify();
  return moved;
}
