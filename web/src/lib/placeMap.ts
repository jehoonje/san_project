// web/src/lib/placeMap.ts
// 저장한 장소: "종이 위에 켜지는 점".
// 작은 별빛 점 하나와 숨 쉬듯 번지는 가는 파문, 면 위에 올린 이름만 그립니다.
import type * as maplibregl from "maplibre-gl";
import { MAP_FONT, readMapPalette, type MapPalette } from "@/lib/mapStyle";
import type { PlaceCategory, PlaceMapItem } from "@/types/place";

type PlaceFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string | number;
    properties: { name: string; category: PlaceCategory };
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

function toFeatureCollection(places: PlaceMapItem[]): PlaceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place, index) => ({
      type: "Feature",
      id: place.id ?? index,
      properties: { name: place.name, category: place.category },
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
    })),
  };
}

export function placeSourceId(prefix: string) {
  return `${prefix}-place-source`;
}

export function placeLayerId(prefix: string) {
  return `${prefix}-place-layer`;
}

export function placeDotLayerId(prefix: string) {
  return `${prefix}-place-dot`;
}

export function placeRingLayerId(prefix: string) {
  return `${prefix}-place-ring`;
}

export function addPlaceLayer(
  map: maplibregl.Map,
  prefix: string,
  places: PlaceMapItem[],
  p: MapPalette = readMapPalette(),
) {
  const sourceId = placeSourceId(prefix);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: "geojson", data: toFeatureCollection(places) });
  }

  if (!map.getLayer(placeRingLayerId(prefix))) {
    map.addLayer({
      id: placeRingLayerId(prefix),
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 0.75,
        "circle-stroke-color": p.ink,
        "circle-stroke-opacity": 0.5,
      },
    });
  }

  if (!map.getLayer(placeDotLayerId(prefix))) {
    map.addLayer({
      id: placeDotLayerId(prefix),
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 4,
        "circle-color": p.star,
        "circle-stroke-width": 2,
        "circle-stroke-color": p.paper,
      },
    });
  }

  if (!map.getLayer(placeLayerId(prefix))) {
    map.addLayer({
      id: placeLayerId(prefix),
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": MAP_FONT,
        "text-letter-spacing": 0.02,
        "text-anchor": "top",
        "text-offset": [0, 1.1],
        "text-max-width": 9,
        "text-optional": true,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": p.ink,
        "text-halo-color": p.paper,
        "text-halo-width": 2.2,
        "text-halo-blur": 0.4,
      },
    });
  }
}

/** 테마 전환 시 장소 점·이름 색 갱신 */
export function applyPlacePalette(
  map: maplibregl.Map,
  prefix: string,
  p: MapPalette = readMapPalette(),
) {
  try {
    if (map.getLayer(placeRingLayerId(prefix))) {
      map.setPaintProperty(placeRingLayerId(prefix), "circle-stroke-color", p.ink);
    }
    if (map.getLayer(placeDotLayerId(prefix))) {
      map.setPaintProperty(placeDotLayerId(prefix), "circle-color", p.star);
      map.setPaintProperty(placeDotLayerId(prefix), "circle-stroke-color", p.paper);
    }
    if (map.getLayer(placeLayerId(prefix))) {
      map.setPaintProperty(placeLayerId(prefix), "text-color", p.ink);
      map.setPaintProperty(placeLayerId(prefix), "text-halo-color", p.paper);
    }
  } catch {
    /* 스타일이 내려가는 중이면 무시 */
  }
}

export function updatePlaceLayer(
  map: maplibregl.Map,
  prefix: string,
  places: PlaceMapItem[],
) {
  (map.getSource(placeSourceId(prefix)) as maplibregl.GeoJSONSource | undefined)
    ?.setData(toFeatureCollection(places));
}

/** 파문이 3초 주기로 숨 쉬듯 번지는 애니메이션. 반환된 함수로 정지합니다. */
export function startPlacePulse(map: maplibregl.Map, prefix: string) {
  const id = placeRingLayerId(prefix);
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 60 || !map.getLayer(id)) return;
    last = now;

    const phase = (now % 3000) / 3000;
    const eased = 1 - Math.pow(1 - phase, 3);
    map.setPaintProperty(id, "circle-radius", 5 + eased * 15);
    map.setPaintProperty(id, "circle-stroke-opacity", 0.6 * (1 - eased));
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
