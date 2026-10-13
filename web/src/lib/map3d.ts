import * as maplibregl from "maplibre-gl";

export const MAP_3D = {
  initialPitch: 62,
  maxPitch: 80,
  initialZoom: 16.4,
  followZoom: 17.2,
  minBuildingZoom: 14,
} as const;

type AnyLayer = {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
};

const BUILDING_LAYER_ID = "san-3d-buildings";

export function enable3DWorld(map: maplibregl.Map) {
  const layers = (map.getStyle()?.layers ?? []) as AnyLayer[];

  const flatBuilding = layers.find(
    (layer) => layer["source-layer"] === "building",
  );
  const buildingSource = flatBuilding?.source ?? "carto";
  const firstSymbolId = layers.find((layer) => layer.type === "symbol")?.id;

  if (flatBuilding) {
    try {
      map.setLayoutProperty(flatBuilding.id, "visibility", "none");
    } catch {
      /* ignore */
    }
  }

  if (!map.getLayer(BUILDING_LAYER_ID) && map.getSource(buildingSource)) {
    map.addLayer(
      {
        id: BUILDING_LAYER_ID,
        type: "fill-extrusion",
        source: buildingSource,
        "source-layer": "building",
        minzoom: MAP_3D.minBuildingZoom,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 10],
            0, "#1c2535",
            30, "#27364d",
            80, "#33476a",
            200, "#46608c",
          ],
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
          "fill-extrusion-opacity": 0.94,
          "fill-extrusion-vertical-gradient": true,
        },
      } as maplibregl.FillExtrusionLayerSpecification,
      firstSymbolId,
    );
  }

  try {
    map.setLight({
      anchor: "map",
      color: "#b9c8ff",
      intensity: 0.4,
      position: [1.4, 210, 38],
    });
  } catch {
    /* ignore */
  }

  // MapLibre 5+ : 하늘/안개. 하위 버전이면 조용히 건너뜁니다.
  try {
    const m = map as unknown as { setSky?: (sky: Record<string, unknown>) => void };
    m.setSky?.({
      "sky-color": "#0b1020",
      "horizon-color": "#2a3a5c",
      "fog-color": "#0d1220",
      "fog-ground-blend": 0.82,
      "horizon-fog-blend": 0.6,
      "sky-horizon-blend": 0.5,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 0],
    });
  } catch {
    /* ignore */
  }
}

export function disable3DWorld(map: maplibregl.Map) {
  if (map.getLayer(BUILDING_LAYER_ID)) map.removeLayer(BUILDING_LAYER_ID);
}

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

/** 첨부 이미지의 광택 블랙 인간 형태 + 앱 포인트 컬러(#ff6843) 림라이트 */
export function createAvatarElement() {
  const root = document.createElement("div");
  root.className = "san-avatar is-idle";
  root.innerHTML = `
    <div class="san-avatar-flip">
      <svg class="san-fig" viewBox="0 0 60 104" width="48" height="83" aria-hidden="true">
        <defs>
          <linearGradient id="san-fig-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#3a414d" />
            <stop offset="0.45" stop-color="#14181f" />
            <stop offset="1" stop-color="#07090c" />
          </linearGradient>
          <radialGradient id="san-fig-head" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stop-color="#4a525f" />
            <stop offset="0.5" stop-color="#171b22" />
            <stop offset="1" stop-color="#07090c" />
          </radialGradient>
        </defs>
        <g class="san-fig-body">
          <g class="limb leg leg-l"><rect x="20" y="54" width="9.5" height="42" rx="4.75" /></g>
          <g class="limb leg leg-r"><rect x="30.5" y="54" width="9.5" height="42" rx="4.75" /></g>
          <rect class="torso" x="16.5" y="26" width="27" height="36" rx="12" />
          <g class="limb arm arm-l"><rect x="8" y="29" width="8.5" height="32" rx="4.25" /></g>
          <g class="limb arm arm-r"><rect x="43.5" y="29" width="8.5" height="32" rx="4.25" /></g>
          <circle class="head" cx="30" cy="14" r="11.5" />
          <ellipse class="gloss" cx="26" cy="9.5" rx="4.5" ry="2.8" transform="rotate(-25 26 9.5)" />
          <path class="gloss" d="M23 33 Q22 44 24 54" />
        </g>
      </svg>
    </div>
    <div class="san-avatar-shadow"></div>`;
  return root;
}

export function setAvatarMotion(
  el: HTMLElement,
  state: { walking: boolean; speed: number; faceRight: boolean },
) {
  el.classList.toggle("is-walking", state.walking);
  el.classList.toggle("is-idle", !state.walking);
  el.classList.toggle("is-flipped", !state.faceRight);
  const cycle = Math.max(0.42, Math.min(0.95, 1.1 - state.speed * 0.18));
  el.style.setProperty("--walk-cycle", `${cycle.toFixed(2)}s`);
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