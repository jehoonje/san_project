// web/src/lib/dwell.ts
import { haversineMeters, type LngLat } from "@/lib/geo";

// 한 곳에 머무르는 구간. 반경 안에 들어온 좌표들의 평균을 중심으로 삼는다.
export type DwellCluster = {
  id: number;
  center: LngLat;
  count: number;
  startedAt: number;
  lastSeenAt: number;
  prompted: boolean;
};

export const DWELL_RADIUS_METERS = 40;
export const DWELL_THRESHOLD_MS = 5 * 60 * 1000;

export function dwellMinutesOf(cluster: DwellCluster, now?: number) {
  const end = now ?? cluster.lastSeenAt;
  return Math.max(1, Math.round((end - cluster.startedAt) / 60000));
}

/*
 * 기록 중 들어오는 좌표를 보고 "한 곳에 오래 머무는 중"인지 판단한다.
 * - 좌표가 현재 구간 중심에서 반경 이내면 같은 구간으로 보고 중심을 평균으로 보정
 * - 반경을 벗어나면 이전 구간을 끝내고(반환) 새 구간을 시작
 * - 구간이 기준 시간 이상 이어지면 due()가 그 구간을 돌려준다(구간당 1번)
 */
export class DwellDetector {
  private cluster: DwellCluster | null = null;
  private nextId = 1;

  constructor(
    private readonly radiusMeters = DWELL_RADIUS_METERS,
    private readonly thresholdMs = DWELL_THRESHOLD_MS,
  ) {}

  // 반경을 벗어나 끝난 구간이 있으면 반환
  observe(point: LngLat, now: number): DwellCluster | null {
    const current = this.cluster;

    if (
      current &&
      haversineMeters(current.center, point) <= this.radiusMeters
    ) {
      current.count += 1;
      current.center = [
        current.center[0] +
          (point[0] - current.center[0]) / current.count,
        current.center[1] +
          (point[1] - current.center[1]) / current.count,
      ];
      current.lastSeenAt = now;
      return null;
    }

    this.cluster = {
      id: this.nextId++,
      center: point,
      count: 1,
      startedAt: now,
      lastSeenAt: now,
      prompted: false,
    };

    return current;
  }

  // 아직 물어보지 않았고 기준 시간 이상 머문 구간
  due(now: number): DwellCluster | null {
    const current = this.cluster;
    if (!current || current.prompted) return null;
    if (now - current.startedAt < this.thresholdMs) return null;
    return current;
  }

  markPrompted(id: number) {
    if (this.cluster?.id === id) {
      this.cluster.prompted = true;
    }
  }

  // 일시정지/종료 시 현재 구간을 끝내고 반환
  reset(): DwellCluster | null {
    const current = this.cluster;
    this.cluster = null;
    return current;
  }
}
