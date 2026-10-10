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
    properties: {
      name: string;
      category: PlaceCategory;
      icon: string;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
};

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

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.48)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(CENTER, 42, 32, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(11,13,16,0.94)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.stroke();
  ctx.restore();

  drawCategoryGlyph(ctx, category);

  ctx.save();
  ctx.beginPath();
  ctx.arc(CENTER, 77, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ff6843";
  ctx.shadowColor = "rgba(255,104,67,0.55)";
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
      geometry: {
        type: "Point",
        coordinates: [place.lng, place.lat],
      },
    })),
  };
}

export function placeSourceId(prefix: string) {
  return `${prefix}-place-source`;
}

export function placeLayerId(prefix: string) {
  return `${prefix}-place-layer`;
}

export function addPlaceLayer(
  map: maplibregl.Map,
  prefix: string,
  places: PlaceMapItem[],
) {
  registerCategoryIcons(map);

  const sourceId = placeSourceId(prefix);
  const layerId = placeLayerId(prefix);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: toFeatureCollection(places),
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
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold"],
        "text-letter-spacing": 0.015,
        "text-anchor": "top",
        "text-offset": [0, 0.7],
        "text-max-width": 9,
        "text-optional": true,
        "text-allow-overlap": false,
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
  const source = map.getSource(placeSourceId(prefix)) as
    | maplibregl.GeoJSONSource
    | undefined;

  source?.setData(toFeatureCollection(places));
}