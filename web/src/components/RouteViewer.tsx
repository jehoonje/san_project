"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addPlaceLayer, applyPlacePalette } from "@/lib/placeMap";
import { applyMapPalette, buildMapStyle, readMapPalette } from "@/lib/mapStyle";
import { onThemeChange } from "@/lib/themeTokens";
import "@/styles/map-3d.css";
import type { SavedRoute } from "@/types/route";

type RouteViewerProps = {
  route: SavedRoute;
  open: boolean;
};

const SOURCE_ID = "saved-route";
const LAYER_ID = "saved-route-line";
const PLACE_PREFIX = "saved";
const MAX_PAD = { top: 150, right: 44, bottom: 340, left: 44 };
const GESTURES = [
  "dragPan",
  "scrollZoom",
  "touchZoomRotate",
  "doubleClickZoom",
] as const;

function formatDuration(seconds: number | null) {
  if (seconds == null) return "-";
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0)
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  if (minutes > 0)
    return remainingSeconds > 0
      ? `${minutes}분 ${remainingSeconds}초`
      : `${minutes}분`;
  return `${remainingSeconds}초`;
}

function getPadding(container: HTMLElement) {
  const h = container.clientHeight;
  const w = container.clientWidth;
  const maxV = Math.max(0, h * 0.7);
  let top: number = MAX_PAD.top;
  let bottom: number = MAX_PAD.bottom;
  if (top + bottom > maxV) {
    const scale = maxV / (top + bottom);
    top = Math.floor(top * scale);
    bottom = Math.floor(bottom * scale);
  }
  const side = Math.min(MAX_PAD.left, Math.floor(w * 0.1));
  return { top, bottom, left: side, right: side };
}

function setGestures(map: maplibregl.Map, enabled: boolean) {
  for (const name of GESTURES) {
    if (enabled) map[name].enable();
    else map[name].disable();
  }
}

// 애니메이션 동안 제스처를 잠그고, 끝나면 해제. 해제 함수를 반환
function fitRoute(
  map: maplibregl.Map,
  bounds: maplibregl.LngLatBounds,
  container: HTMLElement,
  duration: number,
) {
  const options = { padding: getPadding(container), maxZoom: 17, duration };

  if (duration <= 0) {
    map.fitBounds(bounds, options);
    return () => {};
  }

  setGestures(map, false);
  map.fitBounds(bounds, options);

  let done = false;
  const unlock = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    map.off("moveend", unlock);
    setGestures(map, true);
  };
  const timer = setTimeout(unlock, duration + 400);
  map.on("moveend", unlock);
  return unlock;
}

function makeDot(kind: "start" | "end") {
  const dot = document.createElement("div");
  dot.className = kind === "end" ? "san-route-dot is-end" : "san-route-dot";
  return dot;
}

function formatClock(value: string | null | undefined) {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDay(value: string | null | undefined) {
  if (!value) return "----.--.--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "----.--.--";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatCoord(coord: [number, number] | undefined) {
  if (!coord) return "—";
  return `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}`;
}

export function RouteViewer({ route, open }: RouteViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  const unlockRef = useRef<(() => void) | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const hasCoords = (route.coordinates?.length ?? 0) > 0;

  // 열릴 때: 크기 재계산 후 경로에 맞추기
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!open || !map || !container) return;

    const fit = (duration: number) => {
      map.resize();
      if (!boundsRef.current) return;
      unlockRef.current?.();
      unlockRef.current = fitRoute(map, boundsRef.current, container, duration);
    };

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => fit(600));
    });
    const timer = setTimeout(() => map.resize(), 320);

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
      unlockRef.current?.();
      unlockRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    const container = containerRef.current;
    const coords = route.coordinates ?? [];
    const places = (route.route_places ?? []).filter(
      (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat),
    );
    if (!container || !coords.length) return;

    let disposed = false;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container,
      style: buildMapStyle(),
      center: coords[0],
      zoom: 12,
      minZoom: 8,
      maxZoom: 19,
      interactive: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
      boxZoom: false,
      attributionControl: false,
      trackResize: false,
    });

    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "top-right",
    );

    const collapseAttribution = () => {
      const el = container.querySelector(".maplibregl-ctrl-attrib");
      el?.classList.remove("maplibregl-compact-show");
      el?.removeAttribute("open");
    };
    map.on("mousedown", collapseAttribution);
    map.on("touchstart", collapseAttribution);
    map.on("wheel", collapseAttribution);

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    map.on("load", () => {
      if (disposed) return;
      map.resize();
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      });
      map.addLayer({
        id: LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        // 잉크로 그은 가는 선
        paint: {
          "line-color": readMapPalette().route,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 17, 2.25],
          "line-opacity": 0.95,
        },
      });

      addPlaceLayer(map, PLACE_PREFIX, places);
      new maplibregl.Marker({ element: makeDot("start"), anchor: "center" })
        .setLngLat(coords[0])
        .addTo(map);
      if (coords.length > 1) {
        new maplibregl.Marker({ element: makeDot("end"), anchor: "center" })
          .setLngLat(coords[coords.length - 1])
          .addTo(map);
      }

      const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
      for (const coord of coords) bounds.extend(coord);
      for (const place of places) bounds.extend([place.lng, place.lat]);
      boundsRef.current = bounds;

      unlockRef.current?.();
      unlockRef.current = fitRoute(
        map,
        bounds,
        container,
        openRef.current ? 900 : 0,
      );
    });

    map.on("error", (event) => console.error("VIEWER MAP ERROR:", event.error));

    const stopThemeWatch = onThemeChange(() => {
      if (disposed || !map.getLayer(LAYER_ID)) return;
      const palette = readMapPalette();
      applyMapPalette(map, palette);
      applyPlacePalette(map, PLACE_PREFIX, palette);
      map.setPaintProperty(LAYER_ID, "line-color", palette.route);
    });

    return () => {
      disposed = true;
      stopThemeWatch();
      unlockRef.current?.();
      unlockRef.current = null;
      resizeObserver.disconnect();
      boundsRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [route.id, route.coordinates, route.route_places]);

  const distanceMeters = Number(route.distance_meters) || 0;
  const km = (distanceMeters / 1000).toFixed(2);
  const placeCount = route.route_places?.length ?? 0;
  const coords = route.coordinates ?? [];
  const first = coords[0];
  const last = coords[coords.length - 1];

  return (
    <div
      className={`san-route-viewer absolute inset-0 z-10 h-full min-h-0 w-full overflow-hidden bg-san-bg transition duration-500 ease-ambient ${open ? "visible opacity-100 blur-0" : "pointer-events-none invisible opacity-0 blur-[8px]"}`}
      aria-hidden={!open}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 h-full min-h-0 w-full"
      />
      {!hasCoords && (
        <div className="absolute inset-0 z-[5] grid place-items-center px-8 text-center text-[13px] text-san-text">
          이 걸음에는 그릴 수 있는 선이 없어요
        </div>
      )}

      {/* 정보가 읽히도록 아래쪽에 종이 색이 번져 올라옴 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%]"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, color-mix(in oklab, var(--san-background) 78%, transparent) 38%, var(--san-background) 70%)",
        }}
      />

      <section
        className="pointer-events-auto absolute inset-x-0 z-20 mx-auto max-w-xl px-6 text-san-text"
        style={{ bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 92px)" }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`${route.title} 루트 정보`}
      >
        <p className="san-eyebrow">{formatDay(route.started_at)}</p>
        <h2 className="san-display mt-2 line-clamp-2">{route.title}</h2>

        {/* 큰 수치 하나 + 정밀한 보조 수치 */}
        <dl className="m-0 mt-5 flex items-end gap-6">
          <div>
            <dt className="sr-only">거리</dt>
            <dd className="m-0 font-mono text-[34px] font-light leading-none tracking-[-0.02em] tabular-nums">
              {km}
              <span className="ml-1.5 text-[11px] tracking-[0.16em]">KM</span>
            </dd>
          </div>
          <div className="pb-0.5">
            <dt className="san-eyebrow">TIME</dt>
            <dd className="san-data m-0 mt-1">
              {formatDuration(route.duration_seconds)}
            </dd>
          </div>
          {placeCount > 0 && (
            <div className="pb-0.5">
              <dt className="san-eyebrow flex items-center gap-1.5">
                <span className="san-dot san-dot-star" aria-hidden="true" />
                PLACES
              </dt>
              <dd className="san-data m-0 mt-1">{placeCount}</dd>
            </div>
          )}
        </dl>

        {/* 시작/종료: 시각과 좌표 */}
        <dl className="m-0 mt-5 grid gap-2">
          <div className="flex items-center gap-3">
            <dt className="flex w-[74px] items-center gap-2">
              <span className="san-route-dot h-2 w-2" aria-hidden="true" />
              <span className="san-eyebrow">START</span>
            </dt>
            <dd className="san-data m-0 flex min-w-0 gap-3">
              <span>{formatClock(route.started_at)}</span>
              <span className="truncate">{formatCoord(first)}</span>
            </dd>
          </div>
          <div className="flex items-center gap-3">
            <dt className="flex w-[74px] items-center gap-2">
              <span className="san-dot h-2 w-2" aria-hidden="true" />
              <span className="san-eyebrow">END</span>
            </dt>
            <dd className="san-data m-0 flex min-w-0 gap-3">
              <span>{formatClock(route.ended_at)}</span>
              <span className="truncate">{formatCoord(last)}</span>
            </dd>
          </div>
        </dl>
      </section>

      <style jsx global>{`
        .san-route-viewer .maplibregl-ctrl-top-right {
          top: calc(env(safe-area-inset-top, 0px) + 68px);
          right: 8px;
        }
        .san-route-viewer .maplibregl-ctrl-attrib {
          max-width: min(240px, calc(100vw - 32px));
        }
        @media (prefers-reduced-motion: reduce) {
          .san-route-viewer {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
