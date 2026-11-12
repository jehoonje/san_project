import * as maplibregl from "maplibre-gl";
import { MAP_SOURCE_ID, readMapPalette, type MapPalette } from "@/lib/mapStyle";

export const MAP_3D = {
  initialPitch: 62,
  maxPitch: 80,
  initialZoom: 15.7,
  followZoom: 16.5,
  minBuildingZoom: 14,
} as const;

const BUILDING_LAYER_ID = "san-3d-buildings";
const FLAT_BUILDING_ID = "building";

function extrusionColor(p: MapPalette) {
  // 낮은 건물과 높은 건물도 같은 톤 안에서만 아주 조금 달라짐
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "render_height"], 10],
    0,
    p.building,
    120,
    p.buildingTop,
  ] as unknown as maplibregl.ExpressionSpecification;
}

function applySky(map: maplibregl.Map, p: MapPalette) {
  try {
    map.setLight({
      anchor: "map",
      color: p.buildingTop,
      intensity: 0.28,
      position: [1.4, 210, 38],
    });
  } catch {
    /* ignore */
  }

  // MapLibre 5+ : 하늘/안개. 지평선이 종이(먹) 색으로 번지며 사라짐
  try {
    const m = map as unknown as { setSky?: (sky: Record<string, unknown>) => void };
    m.setSky?.({
      "sky-color": p.paper,
      "horizon-color": p.paper,
      "fog-color": p.paper,
      "fog-ground-blend": 0.72,
      "horizon-fog-blend": 0.8,
      "sky-horizon-blend": 0.6,
      "atmosphere-blend": 0,
    });
  } catch {
    /* ignore */
  }
}

export function enable3DWorld(map: maplibregl.Map, p: MapPalette = readMapPalette()) {
  if (map.getLayer(FLAT_BUILDING_ID)) {
    try {
      map.setLayoutProperty(FLAT_BUILDING_ID, "visibility", "none");
    } catch {
      /* ignore */
    }
  }

  const firstSymbolId = (map.getStyle()?.layers ?? []).find(
    (layer) => layer.type === "symbol",
  )?.id;

  if (!map.getLayer(BUILDING_LAYER_ID) && map.getSource(MAP_SOURCE_ID)) {
    map.addLayer(
      {
        id: BUILDING_LAYER_ID,
        type: "fill-extrusion",
        source: MAP_SOURCE_ID,
        "source-layer": "building",
        minzoom: MAP_3D.minBuildingZoom,
        paint: {
          "fill-extrusion-color": extrusionColor(p),
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            MAP_3D.minBuildingZoom, 0,
            MAP_3D.minBuildingZoom + 1, ["coalesce", ["get", "render_height"], 10],
          ],
          "fill-extrusion-base": [
            "interpolate",
            ["linear"],
            ["zoom"],
            MAP_3D.minBuildingZoom, 0,
            MAP_3D.minBuildingZoom + 1, ["coalesce", ["get", "render_min_height"], 0],
          ],
          "fill-extrusion-opacity": 0.7,
          "fill-extrusion-vertical-gradient": true,
        },
      } as maplibregl.FillExtrusionLayerSpecification,
      firstSymbolId,
    );
  }

  applySky(map, p);
}

/** 테마 전환 시 3D 건물·하늘 색 갱신 */
export function apply3DPalette(map: maplibregl.Map, p: MapPalette = readMapPalette()) {
  if (map.getLayer(BUILDING_LAYER_ID)) {
    try {
      map.setPaintProperty(BUILDING_LAYER_ID, "fill-extrusion-color", extrusionColor(p));
    } catch {
      /* ignore */
    }
  }
  applySky(map, p);
}

export function disable3DWorld(map: maplibregl.Map) {
  if (map.getLayer(BUILDING_LAYER_ID)) map.removeLayer(BUILDING_LAYER_ID);
}

/** 현재 위치: 잉크 점 + 3초 주기로 번지는 파문 + 가는 시야 호 */
export function createGroundMarkerElement() {
  const root = document.createElement("div");
  root.className = "san-ground-marker";
  root.innerHTML =
    '<div class="san-ground-ring"></div>' +
    '<div class="san-ground-ring is-delayed"></div>' +
    '<div class="san-ground-cone"></div>' +
    '<div class="san-ground-core"></div>';
  return root;
}

export function distanceMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingBetween(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function shortestAngleDelta(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number };

export async function requestCompassPermission(): Promise<boolean> {
  const Evt = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof Evt?.requestPermission === "function") {
    try {
      return (await Evt.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

export function listenCompass(onHeading: (deg: number) => void) {
  const handler = (event: Event) => {
    const e = event as OrientationEvt;
    let heading: number | null = null;
    if (typeof e.webkitCompassHeading === "number") {
      heading = e.webkitCompassHeading;
    } else if (e.absolute && typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    }
    if (heading !== null && Number.isFinite(heading)) onHeading(heading);
  };
  window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
  window.addEventListener("deviceorientation", handler as EventListener, true);
  return () => {
    window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.removeEventListener("deviceorientation", handler as EventListener, true);
  };
}