import type * as maplibregl from "maplibre-gl";
import {
  PLACE_CATEGORIES,
  type PlaceCategory,
  type PlaceMapItem,
} from "@/types/place";

const ICON_PREFIX = "san-place-icon-";
const ICON_PIXEL_SIZE = 88;
const CENTER = 44;

type CanvasContext = CanvasRenderingContext2D;

type PlaceFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string | number;
    properties: { name: string; category: PlaceCategory; icon: string };
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

type BeaconFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string | number;
    properties: { category: PlaceCategory; height: number };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }>;
};

const CATEGORY_COLORS: Record<string, string> = {
  cafe: "#ffb347",
  restaurant: "#ff6843",
  bar: "#c77dff",
  park: "#4ade80",
  shop: "#38bdf8",
  culture: "#f472b6",
};
const DEFAULT_COLOR = "#ff6843";

const BEACON_RADIUS_M = 7;
const BEACON_HEIGHT_M = 26;

function iconId(category: PlaceCategory) {
  return `${ICON_PREFIX}${category}`;
}

function strokeSetup(ctx: CanvasContext) {
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawCategoryGlyph(ctx: CanvasContext, category: PlaceCategory) {
  ctx.save();
  strokeSetup(ctx);

  switch (category) {
    case "cafe": {
      ctx.strokeRect(31, 33, 22, 17);
      ctx.beginPath();
      ctx.arc(56, 39, 6, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(29, 55);
      ctx.lineTo(57, 55);
      ctx.stroke();
      break;
    }
    case "restaurant": {
      ctx.beginPath();
      ctx.moveTo(34, 29);
      ctx.lineTo(34, 56);
      ctx.moveTo(29, 29);
      ctx.lineTo(29, 39);
      ctx.quadraticCurveTo(34, 44, 39, 39);
      ctx.lineTo(39, 29);
      ctx.moveTo(53, 29);
      ctx.lineTo(53, 56);
      ctx.moveTo(53, 29);
      ctx.quadraticCurveTo(61, 36, 53, 44);
      ctx.stroke();
      break;
    }
    case "bar": {
      ctx.beginPath();
      ctx.moveTo(29, 31);
      ctx.lineTo(59, 31);
      ctx.lineTo(47, 44);
      ctx.lineTo(47, 56);
      ctx.moveTo(39, 56);
      ctx.lineTo(55, 56);
      ctx.moveTo(35, 36);
      ctx.lineTo(53, 36);
      ctx.stroke();
      break;
    }
    case "park": {
      ctx.beginPath();
      ctx.moveTo(44, 57);
      ctx.lineTo(44, 44);
      ctx.moveTo(44, 50);
      ctx.lineTo(36, 43);
      ctx.moveTo(44, 47);
      ctx.lineTo(52, 39);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(44, 36, 11, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "shop": {
      ctx.strokeRect(31, 38, 26, 19);
      ctx.beginPath();
      ctx.moveTo(29, 38);
      ctx.lineTo(34, 29);
      ctx.lineTo(54, 29);
      ctx.lineTo(59, 38);
      ctx.moveTo(38, 29);
      ctx.lineTo(36, 38);
      ctx.moveTo(44, 29);
      ctx.lineTo(44, 38);
      ctx.moveTo(50, 29);
      ctx.lineTo(52, 38);
      ctx.stroke();
      break;
    }
    case "culture": {
      ctx.beginPath();
      ctx.arc(38, 39, 10, 0, Math.PI * 2);
      ctx.arc(50, 39, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(34, 37);
      ctx.lineTo(37, 35);
      ctx.moveTo(45, 35);
      ctx.lineTo(48, 37);
      ctx.moveTo(35, 44);
      ctx.quadraticCurveTo(38, 47, 41, 44);
      ctx.moveTo(47, 45);
      ctx.quadraticCurveTo(50, 42, 53, 45);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(44, 42, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(44, 42, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function createCategoryIcon(category: PlaceCategory): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_PIXEL_SIZE;
  canvas.height = ICON_PIXEL_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("장소 아이콘을 만들 Canvas를 초기화하지 못했습니다.");
  }

  ctx.clearRect(0, 0, ICON_PIXEL_SIZE, ICON_PIXEL_SIZE);
  const accent = CATEGORY_COLORS[category] ?? DEFAULT_COLOR;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.48)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(CENTER, 42, 32, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(11,13,16,0.94)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.restore();

  drawCategoryGlyph(ctx, category);

  ctx.save();
  ctx.beginPath();
  ctx.arc(CENTER, 77, 4, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.restore();

  return ctx.getImageData(0, 0, ICON_PIXEL_SIZE, ICON_PIXEL_SIZE);
}

function registerCategoryIcons(map: maplibregl.Map) {
  for (const category of PLACE_CATEGORIES) {
    const id = iconId(category.key);
    if (map.hasImage(id)) continue;
    map.addImage(id, createCategoryIcon(category.key), { pixelRatio: 2 });
  }
}

function toFeatureCollection(places: PlaceMapItem[]): PlaceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place, index) => ({
      type: "Feature",
      id: place.id ?? index,
      properties: {
        name: place.name,
        category: place.category,
        icon: iconId(place.category),
      },
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
    })),
  };
}

function circlePolygon(lng: number, lat: number, radiusM: number, steps = 20) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return [ring];
}

function toBeaconCollection(places: PlaceMapItem[]): BeaconFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place, index) => ({
      type: "Feature",
      id: place.id ?? index,
      properties: { category: place.category, height: BEACON_HEIGHT_M },
      geometry: {
        type: "Polygon",
        coordinates: circlePolygon(place.lng, place.lat, BEACON_RADIUS_M),
      },
    })),
  };
}

const colorMatch = [
  "match",
  ["get", "category"],
  ...Object.entries(CATEGORY_COLORS).flat(),
  DEFAULT_COLOR,
] as unknown as maplibregl.ExpressionSpecification;

function ringRadius(meters: number): maplibregl.ExpressionSpecification {
  // 줌이 1 오를 때마다 픽셀 크기가 2배 → 실제 미터 크기를 유지
  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    10, meters / 128,
    22, meters * 32,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export function placeSourceId(prefix: string) {
  return `${prefix}-place-source`;
}

export function placeLayerId(prefix: string) {
  return `${prefix}-place-layer`;
}

export function beaconSourceId(prefix: string) {
  return `${prefix}-beacon-source`;
}

export function beaconLayerId(prefix: string) {
  return `${prefix}-beacon-layer`;
}

export function beaconRingLayerId(prefix: string) {
  return `${prefix}-beacon-ring`;
}

export function addPlaceLayer(
  map: maplibregl.Map,
  prefix: string,
  places: PlaceMapItem[],
) {
  registerCategoryIcons(map);

  const sourceId = placeSourceId(prefix);
  const layerId = placeLayerId(prefix);
  const bSourceId = beaconSourceId(prefix);

  if (!map.getSource(bSourceId)) {
    map.addSource(bSourceId, { type: "geojson", data: toBeaconCollection(places) });
  }

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: "geojson", data: toFeatureCollection(places) });
  }

  if (!map.getLayer(beaconRingLayerId(prefix))) {
    map.addLayer({
      id: beaconRingLayerId(prefix),
      type: "circle",
      source: sourceId,
      paint: {
        "circle-pitch-alignment": "map",
        "circle-pitch-scale": "map",
        "circle-radius": ringRadius(18),
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 2,
        "circle-stroke-color": [
          "match",
          ["get", "category"],
          ...Object.entries(CATEGORY_COLORS).flat(),
          DEFAULT_COLOR,
        ] as unknown as maplibregl.ExpressionSpecification,
        "circle-stroke-opacity": 0.8,
      },
    });
  }

  if (!map.getLayer(beaconLayerId(prefix))) {
    map.addLayer({
      id: beaconLayerId(prefix),
      type: "fill-extrusion",
      source: bSourceId,
      paint: {
        "fill-extrusion-color": colorMatch,
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.82,
        "fill-extrusion-vertical-gradient": true,
      },
    });
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: sourceId,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-anchor": "bottom",
        "icon-offset": [0, -26],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "viewport",
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold"],
        "text-letter-spacing": 0.015,
        "text-anchor": "top",
        "text-offset": [0, -1.2],
        "text-max-width": 9,
        "text-optional": true,
        "text-allow-overlap": false,
        "text-pitch-alignment": "viewport",
      },
      paint: {
        "text-color": "rgba(255,255,255,0.92)",
        "text-halo-color": "rgba(5,7,10,0.92)",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.5,
      },
    });
  }
}

export function updatePlaceLayer(
  map: maplibregl.Map,
  prefix: string,
  places: PlaceMapItem[],
) {
  (map.getSource(placeSourceId(prefix)) as maplibregl.GeoJSONSource | undefined)
    ?.setData(toFeatureCollection(places));
  (map.getSource(beaconSourceId(prefix)) as maplibregl.GeoJSONSource | undefined)
    ?.setData(toBeaconCollection(places));
}

/** 링이 숨쉬듯 퍼지는 실시간 애니메이션. 반환된 함수로 정지합니다. */
export function startPlacePulse(map: maplibregl.Map, prefix: string) {
  const id = beaconRingLayerId(prefix);
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 50 || !map.getLayer(id)) return;
    last = now;

    const phase = (now % 2200) / 2200;
    map.setPaintProperty(id, "circle-radius", ringRadius(8 + phase * 16));
    map.setPaintProperty(id, "circle-stroke-opacity", 0.9 * (1 - phase));
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}