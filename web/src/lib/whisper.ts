// web/src/lib/whisper.ts
// 걷는 중 한 줄: 기록하는 동안 가끔 조용히 떠오르는 관찰.
//
// 왜 모델을 부르지 않는가
//  - 걷는 중에는 즉시 떠야 하고, 몇 분마다 반복된다. 매번 모델을 부르면 느리고 비싸다.
//  - 여기서 하는 말은 모두 이미 가진 데이터로 셀 수 있는 사실이다.
//    (이 동네가 처음인지, 몇 번째인지, 얼마나 걸었는지, 지금이 몇 시인지)
//  - 해석이 필요한 말은 주간 잔향이 맡는다. 거기서만 모델을 부른다.
import { haversineMeters, type LngLat } from "@/lib/geo";
import type { SavedRoute } from "@/types/route";

export type Whisper = {
  /** 같은 관찰을 한 번만 띄우기 위한 키 */
  key: string;
  text: string;
};

export type WhisperContext = {
  /** 지금 기록 중인 경로 */
  coords: LngLat[];
  distanceMeters: number;
  startedAt: string | null;
  /** 지금 서 있는 곳의 행정동 (모르면 null) */
  regionDong: string | null;
  /** 지금까지 저장한 모든 루트 (지난 기록) */
  past: SavedRoute[];
  now: Date;
};

/** 지난 기록에서 이 동네를 몇 번 남겼는지 */
function visitsToRegion(past: SavedRoute[], region: string) {
  const days = new Set<string>();
  for (const route of past) {
    for (const place of route.route_places ?? []) {
      if (place.region_dong === region) days.add(place.saved_at.slice(0, 10));
    }
  }
  return days.size;
}

/** 지난 기록에서 이 자리 근처(120m)를 지난 적이 있는지 */
function passedNearBefore(past: SavedRoute[], here: LngLat) {
  for (const route of past) {
    const coords = (route.coordinates ?? []) as LngLat[];
    // 경로가 길면 듬성듬성 봐도 충분합니다
    const step = Math.max(1, Math.floor(coords.length / 120));
    for (let i = 0; i < coords.length; i += step) {
      if (haversineMeters(coords[i], here) <= 120) return true;
    }
  }
  return false;
}

function daysSinceLastWalk(past: SavedRoute[], now: Date) {
  let latest = 0;
  for (const route of past) {
    const at = new Date(route.started_at ?? route.created_at).getTime();
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  if (!latest) return null;
  return Math.floor((now.getTime() - latest) / 86400000);
}

/** 오늘 이미 걸은 거리(저장된 것만) */
function metersToday(past: SavedRoute[], now: Date) {
  const today = now.toISOString().slice(0, 10);
  let total = 0;
  for (const route of past) {
    if ((route.started_at ?? "").slice(0, 10) === today) {
      total += route.distance_meters ?? 0;
    }
  }
  return total;
}

/**
 * 지금 떠올릴 만한 관찰 하나. 없으면 null.
 * 앞쪽 규칙일수록 드물고 할 말이 큰 것입니다.
 */
export function pickWhisper(ctx: WhisperContext): Whisper | null {
  const { coords, distanceMeters, past, regionDong, now } = ctx;
  const here = coords[coords.length - 1];
  const minutes = ctx.startedAt
    ? (now.getTime() - new Date(ctx.startedAt).getTime()) / 60000
    : 0;

  // 아직 걸음이 얼마 안 되면 아무 말도 하지 않습니다
  if (!here || distanceMeters < 120 || minutes < 2) return null;

  const hour = now.getHours();

  // 1) 처음 오는 동네
  if (regionDong) {
    const visits = visitsToRegion(past, regionDong);
    if (visits === 0 && !passedNearBefore(past, here)) {
      return { key: `new-region:${regionDong}`, text: `${regionDong}, 처음이에요` };
    }
    if (visits >= 4) {
      return {
        key: `often-region:${regionDong}:${visits}`,
        text: `${regionDong}, ${visits}번째예요`,
      };
    }
  }

  // 2) 오랜만의 걸음
  const gap = daysSinceLastWalk(past, now);
  if (gap !== null && gap >= 7 && distanceMeters < 600) {
    return { key: `after-gap:${gap}`, text: `${gap}일 만이에요` };
  }

  // 3) 처음 지나는 길
  if (past.length >= 3 && distanceMeters > 900 && !passedNearBefore(past, here)) {
    return { key: "new-path", text: "이 길은 처음이에요" };
  }

  // 4) 오늘 가장 멀리
  const today = metersToday(past, now) + distanceMeters;
  if (today >= 3000 && distanceMeters >= 1500) {
    return {
      key: `far-today:${Math.floor(today / 1000)}`,
      text: `오늘 ${(today / 1000).toFixed(1)}km째예요`,
    };
  }

  // 5) 시간대
  if (hour >= 22 || hour < 5) {
    return { key: `night:${now.toISOString().slice(0, 10)}`, text: "조용한 시간이에요" };
  }
  if (hour >= 5 && hour < 8 && minutes >= 10) {
    return { key: `dawn:${now.toISOString().slice(0, 10)}`, text: "이른 시간이에요" };
  }

  // 6) 오래 걷는 중
  if (minutes >= 45) {
    return {
      key: `long:${Math.floor(minutes / 15)}`,
      text: `${Math.floor(minutes)}분째 걷고 있어요`,
    };
  }

  return null;
}
