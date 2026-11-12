// web/src/lib/mapStyle.ts
// 종이(라이트) / 먹(다크) 지도 스타일.
// 도로·건물·물·녹지는 선 없이 "면의 톤 차이"로만 구분하고, 라벨은 동네 이름 정도만 남깁니다.
// 색은 모두 --san-map-* 토큰에서 읽으므로 테마 전환 시 applyMapPalette()만 다시 부르면 됩니다.
import type * as maplibregl from "maplibre-gl";
import { readToken } from "@/lib/themeTokens";

export type MapPalette = {
  land: string;
  green: string;
  water: string;
  road: string;
  roadMinor: string;
  building: string;
  buildingTop: string;
  label: string;
  route: string;
  star: string;
  live: string;
  paper: string;
  ink: string;
};

export function readMapPalette(): MapPalette {
  return {
    land: readToken("--san-map-land", "#f6efe0"),
    green: readToken("--san-map-green", "#ece6cf"),
    water: readToken("--san-map-water", "#e1dccb"),
    road: readToken("--san-map-road", "#fdf9f0"),
    roadMinor: readToken("--san-map-road-minor", "#faf4e7"),
    building: readToken("--san-map-building", "#ebe2ce"),
    buildingTop: readToken("--san-map-building-top", "#f1e9d8"),
    label: readToken("--san-map-label", "#8f8d74"),
    route: readToken("--san-map-route", "#6b6a4f"),
    star: readToken("--san-star", "#f2b91d"),
    live: readToken("--san-live", "#3fa66b"),
    paper: readToken("--san-background", "#fbf5ea"),
    ink: readToken("--san-text", "#6b6a4f"),
  };
}

const SOURCE = "carto";
const TILES =
  "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";
const GLYPHS = "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf";

export const MAP_FONT = [
  "Montserrat Regular",
  "Open Sans Regular",
  "Noto Sans Regular",
  "HanWangHeiLight Regular",
  "NanumBarunGothic Regular",
];

export const MAP_ATTRIBUTION =
  '© <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

type Role =
  | "land"
  | "green"
  | "water"
  | "road"
  | "roadMinor"
  | "building"
  | "label";

type RoadSpec = {
  id: string;
  classes: string[];
  minzoom: number;
  role: "road" | "roadMinor";
  /** [zoom, px] */
  width: [number, number][];
};

// 도로 등급은 굵기로만 구분 (윤곽선 없음)
const ROADS: RoadSpec[] = [
  {
    id: "road-path",
    classes: ["path", "track"],
    minzoom: 15,
    role: "roadMinor",
    width: [
      [15, 0.8],
      [18, 3],
    ],
  },
  {
    id: "road-minor",
    classes: ["minor", "service"],
    minzoom: 13,
    role: "roadMinor",
    width: [
      [13, 0.6],
      [16, 4],
      [18, 12],
    ],
  },
  {
    id: "road-secondary",
    classes: ["secondary", "tertiary"],
    minzoom: 11,
    role: "road",
    width: [
      [11, 0.6],
      [14, 3],
      [16, 8],
      [18, 22],
    ],
  },
  {
    id: "road-primary",
    classes: ["primary"],
    minzoom: 8,
    role: "road",
    width: [
      [8, 0.6],
      [13, 3],
      [16, 11],
      [18, 28],
    ],
  },
  {
    id: "road-major",
    classes: ["trunk", "motorway"],
    minzoom: 5,
    role: "road",
    width: [
      [5, 0.5],
      [12, 3],
      [16, 13],
      [18, 32],
    ],
  },
];

/** 레이어 id → 어떤 토큰 색을 쓰는지 (테마 전환 시 다시 칠할 때 사용) */
const LAYER_ROLES: Array<{ id: string; type: "fill" | "line" | "symbol" | "background"; role: Role }> = [
  { id: "background", type: "background", role: "land" },
  { id: "landcover", type: "fill", role: "green" },
  { id: "park", type: "fill", role: "green" },
  { id: "landuse", type: "fill", role: "green" },
  { id: "water", type: "fill", role: "water" },
  { id: "waterway", type: "line", role: "water" },
  { id: "aeroway", type: "line", role: "road" },
  ...ROADS.map((r) => ({ id: r.id, type: "line" as const, role: r.role })),
  { id: "rail", type: "line", role: "building" },
  { id: "building", type: "fill", role: "building" },
  { id: "place-neighbourhood", type: "symbol", role: "label" },
  { id: "place-city", type: "symbol", role: "label" },
  { id: "water-name", type: "symbol", role: "label" },
];

function widthExpr(stops: [number, number][]) {
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    ...stops.flat(),
  ] as unknown as maplibregl.ExpressionSpecification;
}

function labelLayer(
  id: string,
  sourceLayer: string,
  filter: unknown,
  minzoom: number,
  maxzoom: number,
  size: [number, number][],
  p: MapPalette,
  extra: Record<string, unknown> = {},
): maplibregl.LayerSpecification {
  return {
    id,
    type: "symbol",
    source: SOURCE,
    "source-layer": sourceLayer,
    filter,
    minzoom,
    maxzoom,
    layout: {
      "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
      "text-font": MAP_FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], ...size.flat()],
      "text-letter-spacing": 0.14,
      "text-max-width": 8,
      "text-padding": 14,
      ...extra,
    },
    paint: {
      "text-color": p.label,
      "text-halo-color": p.land,
      "text-halo-width": 1.6,
      "text-halo-blur": 0.6,
      "text-opacity": 0.9,
    },
  } as unknown as maplibregl.LayerSpecification;
}

/** 기본 지도 스타일 (인라인). 원격 스타일 JSON 없이 타일 소스만 참조합니다. */
export function buildMapStyle(
  p: MapPalette = readMapPalette(),
): maplibregl.StyleSpecification {
  const fill = (
    id: string,
    sourceLayer: string,
    color: string,
    filter?: unknown,
    minzoom?: number,
  ) =>
    ({
      id,
      type: "fill",
      source: SOURCE,
      "source-layer": sourceLayer,
      ...(filter ? { filter } : {}),
      ...(minzoom !== undefined ? { minzoom } : {}),
      paint: { "fill-color": color, "fill-antialias": false },
    }) as unknown as maplibregl.LayerSpecification;

  const layers: maplibregl.LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": p.land } },
    fill("landcover", "landcover", p.green),
    fill("park", "park", p.green),
    fill("landuse", "landuse", p.green, [
      "in",
      ["get", "class"],
      ["literal", ["cemetery", "stadium", "pitch", "playground", "garden"]],
    ]),
    fill("water", "water", p.water, ["==", ["geometry-type"], "Polygon"]),
    {
      id: "waterway",
      type: "line",
      source: SOURCE,
      "source-layer": "waterway",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.water,
        "line-width": widthExpr([
          [10, 0.6],
          [16, 4],
        ]),
      },
    } as unknown as maplibregl.LayerSpecification,
    {
      id: "aeroway",
      type: "line",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 12,
      paint: {
        "line-color": p.road,
        "line-width": widthExpr([
          [12, 1],
          [16, 14],
        ]),
      },
    } as unknown as maplibregl.LayerSpecification,
    ...ROADS.map(
      (road) =>
        ({
          id: road.id,
          type: "line",
          source: SOURCE,
          "source-layer": "transportation",
          minzoom: road.minzoom,
          filter: ["in", ["get", "class"], ["literal", road.classes]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": p[road.role],
            "line-width": widthExpr(road.width),
          },
        }) as unknown as maplibregl.LayerSpecification,
    ),
    {
      id: "rail",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      minzoom: 13,
      filter: ["==", ["get", "class"], "rail"],
      paint: {
        "line-color": p.building,
        "line-width": widthExpr([
          [13, 0.5],
          [18, 2],
        ]),
      },
    } as unknown as maplibregl.LayerSpecification,
    fill("building", "building", p.building, undefined, 13),
    labelLayer(
      "water-name",
      "water_name",
      ["==", ["geometry-type"], "Point"],
      10,
      24,
      [
        [10, 10],
        [16, 12],
      ],
      p,
    ),
    labelLayer(
      "place-neighbourhood",
      "place",
      ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter", "village", "hamlet"]]],
      12,
      24,
      [
        [12, 10.5],
        [17, 13],
      ],
      p,
    ),
    labelLayer(
      "place-city",
      "place",
      ["in", ["get", "class"], ["literal", ["city", "town"]]],
      5,
      13,
      [
        [5, 11],
        [12, 14],
      ],
      p,
    ),
  ];

  return {
    version: 8,
    name: "SAN ink & paper",
    glyphs: GLYPHS,
    sources: {
      [SOURCE]: { type: "vector", url: TILES, attribution: MAP_ATTRIBUTION },
    },
    layers,
  };
}

/** 테마 전환: 이미 올라간 지도의 색만 다시 칠합니다. (커스텀 레이어는 그대로 유지) */
export function applyMapPalette(map: maplibregl.Map, p: MapPalette = readMapPalette()) {
  for (const { id, type, role } of LAYER_ROLES) {
    if (!map.getLayer(id)) continue;
    const color = p[role];
    try {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", color);
      } else if (type === "fill") {
        map.setPaintProperty(id, "fill-color", color);
      } else if (type === "line") {
        map.setPaintProperty(id, "line-color", color);
      } else {
        map.setPaintProperty(id, "text-color", color);
        map.setPaintProperty(id, "text-halo-color", p.land);
      }
    } catch {
      /* 스타일이 내려가는 중이면 무시 */
    }
  }
}

export const MAP_SOURCE_ID = SOURCE;
