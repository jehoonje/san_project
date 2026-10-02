// web/src/lib/placeMap.ts
import type * as maplibregl from "maplibre-gl";
import {
  PLACE_CATEGORIES,
  type PlaceCategory,
  type PlaceMapItem,
} from "@/types/place";

const ICON_PREFIX = "san-place-icon-";
const ICON_PIXEL_SIZE = 96;

const CATEGORY_COLORS: Record<PlaceCategory, string> = {
  cafe: "#92400e",
  restaurant: "#dc2626",
  bar: "#7c3aed",
  park: "#16a34a",
  shop: "#2563eb",
  culture: "#db2777",
  etc: "#525252",
};

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

function createCategoryIcon(
  emoji: string,
  color: string,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_PIXEL_SIZE;
  canvas.height = ICON_PIXEL_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("장소 아이콘을 만들 Canvas를 초기화하지 못했습니다.");
  }

  ctx.clearRect(0, 0, ICON_PIXEL_SIZE, ICON_PIXEL_SIZE);

  // 핀 아래쪽 꼬리
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.moveTo(48, 89);
  ctx.lineTo(29, 55);
  ctx.lineTo(67, 55);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // 원형 배지
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(48, 39, 31, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // 카테고리 이모지
  ctx.save();
  ctx.font =
    '42px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 48, 41);
  ctx.restore();

  return ctx.getImageData(0, 0, ICON_PIXEL_SIZE, ICON_PIXEL_SIZE);
}

function registerCategoryIcons(map: maplibregl.Map) {
  for (const category of PLACE_CATEGORIES) {
    const id = iconId(category.key);
    if (map.hasImage(id)) continue;

    const image = createCategoryIcon(
      category.emoji,
      CATEGORY_COLORS[category.key],
    );

    // 96px 이미지를 pixelRatio 2로 등록해 지도에서는 약 48px로 표시
    map.addImage(id, image, { pixelRatio: 2 });
  }
}

function toFeatureCollection(
  places: PlaceMapItem[],
): PlaceFeatureCollection {
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
        "text-anchor": "top",
        "text-offset": [0, 0.55],
        "text-max-width": 10,
        "text-optional": true,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#171717",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
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