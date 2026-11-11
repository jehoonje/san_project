// web/src/lib/orbitLayout.ts
// 취향 궤도 배치: 안쪽 궤도 = 장소 종류, 바깥 궤도 = 특징(그룹별 구역)
import type { Collection, DexEntry } from "@/lib/tasteCollection";

export type OrbitRing = "inner" | "outer";

export type OrbitNode = {
  entry: DexEntry;
  ring: OrbitRing;
  /** 중심 기준 좌표 */
  x: number;
  y: number;
  radius: number;
};

export type OrbitLink = [OrbitNode, OrbitNode];

const INNER_RADIUS = 64;
const OUTER_RADIUS = 128;

function nodeRadius(entry: DexEntry) {
  return entry.unlocked ? 2.6 + Math.min(entry.count, 6) * 0.55 : 2;
}

export function orbitLayout(collection: Collection) {
  const nodes: OrbitNode[] = [];
  const links: OrbitLink[] = [];

  const place = (entry: DexEntry, ring: OrbitRing, angle: number) => {
    const r = ring === "inner" ? INNER_RADIUS : OUTER_RADIUS;
    const node: OrbitNode = {
      entry,
      ring,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      radius: nodeRadius(entry),
    };
    nodes.push(node);
    return node;
  };

  // 안쪽: 장소 종류를 고르게 배치, 열린 칸끼리 이어 별자리처럼
  const categories =
    collection.groups.find((g) => g.group === "category")?.entries ?? [];
  let previousInner: OrbitNode | null = null;
  categories.forEach((entry, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / categories.length;
    const node = place(entry, "inner", angle);
    if (entry.unlocked) {
      if (previousInner) links.push([previousInner, node]);
      previousInner = node;
    }
  });

  // 바깥: 그룹마다 한 칸씩 띄어 구역을 나눔
  const traitGroups = collection.groups.filter((g) => g.group !== "category");
  const slots =
    traitGroups.reduce((sum, g) => sum + g.entries.length, 0) +
    traitGroups.length;
  let slot = 0;
  for (const group of traitGroups) {
    let previous: OrbitNode | null = null;
    for (const entry of group.entries) {
      const angle = -Math.PI / 2 + ((slot + 0.5) * Math.PI * 2) / slots;
      const node = place(entry, "outer", angle);
      if (entry.unlocked) {
        if (previous) links.push([previous, node]);
        previous = node;
      }
      slot += 1;
    }
    slot += 1;
  }

  return {
    nodes,
    links,
    innerRadius: INNER_RADIUS,
    outerRadius: OUTER_RADIUS,
  };
}
