"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addPlaceLayer } from "@/lib/placeMap";
import type { SavedRoute } from "@/types/route";

type RouteViewerProps = {
  route: SavedRoute;
  open: boolean;
};

const SOURCE_ID = "saved-route";
const LAYER_ID = "saved-route-line";
const PLACE_PREFIX = "saved";
const MAX_PAD = { top: 150, right: 44, bottom: 300, left: 44 };
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

function makeDot(color: string) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "relative",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const ring = document.createElement("div");
  Object.assign(ring.style, {
    position: "absolute",
    inset: "0",
    borderRadius: "50%",
    background: color,
    opacity: "0.2",
  });

  const dot = document.createElement("div");
  Object.assign(dot.style, {
    position: "relative",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: color,
    border: "3px solid #ffffff",
    boxShadow: "0 4px 14px rgba(0,0,0,.45)",
  });

  container.append(ring, dot);
  return container;
}

function RouteIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 19c-1.7 0-3-1.3-3-3s1.3-3 3-3h12c1.7 0 3-1.3 3-3s-1.3-3-3-3H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="19" r="2" fill="currentColor" />
      <circle cx="9" cy="7" r="2" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3.5 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlaceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.4" fill="currentColor" />
    </svg>
  );
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
      style: "https://tiles.openfreemap.org/styles/dark",
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
        paint: {
          "line-color": "#00bfff",
          "line-width": 6,
          "line-opacity": 0.95,
          "line-blur": 0.25,
        },
      });

      addPlaceLayer(map, PLACE_PREFIX, places);
      new maplibregl.Marker({ element: makeDot("#5fd39a"), anchor: "center" })
        .setLngLat(coords[0])
        .addTo(map);
      if (coords.length > 1) {
        new maplibregl.Marker({ element: makeDot("#00bfff"), anchor: "center" })
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

    return () => {
      disposed = true;
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

  return (
    <div
      className={`san-route-viewer absolute inset-0 z-10 h-full min-h-0 w-full overflow-hidden bg-[#050b14] transition duration-300 ease-out ${open ? "visible scale-100 opacity-100" : "pointer-events-none invisible scale-[0.985] opacity-0"}`}
      aria-hidden={!open}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 h-full min-h-0 w-full"
      />
      {!hasCoords && (
        <div className="absolute inset-0 z-[5] grid place-items-center px-8 text-center text-sm text-neutral-500">
          이 루트에는 표시할 경로 좌표가 없어요
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,10,.28)_0%,transparent_28%,transparent_52%,rgba(5,7,10,.86)_100%)]" />

      <section
        className="pointer-events-auto absolute inset-x-4 z-20 rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,23,34,.92),rgba(5,11,20,.96))] p-4 text-white shadow-[0_22px_60px_rgba(0,0,0,.42)] backdrop-blur-2xl"
        style={{ bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 72px + 12px)" }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`${route.title} 루트 정보`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
              Saved route
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-white">
              {route.title}
            </h2>
          </div>
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#00bfff] shadow-[0_0_14px_rgba(0,191,255,.55)]"
            aria-hidden="true"
          />
        </div>

        <dl
          className={`mt-4 grid gap-2 ${placeCount > 0 ? "grid-cols-3" : "grid-cols-2"}`}
        >
          <div className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#0a2233]/60 px-3 py-3">
            <dt className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              <span className="text-[#00bfff]">
                <RouteIcon />
              </span>
              거리
            </dt>
            <dd className="mt-2 truncate text-sm font-semibold tabular-nums text-neutral-100">
              {km} km
            </dd>
          </div>
          <div className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#0a2233]/60 px-3 py-3">
            <dt className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              <span className="text-[#8fa3b8]">
                <ClockIcon />
              </span>
              시간
            </dt>
            <dd className="mt-2 truncate text-sm font-semibold tabular-nums text-neutral-100">
              {formatDuration(route.duration_seconds)}
            </dd>
          </div>
          {placeCount > 0 && (
            <div className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#0a2233]/60 px-3 py-3">
              <dt className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                <span className="text-[#5fd39a]">
                  <PlaceIcon />
                </span>
                장소
              </dt>
              <dd className="mt-2 truncate text-sm font-semibold tabular-nums text-neutral-100">
                {placeCount}개
              </dd>
            </div>
          )}
        </dl>
      </section>

      <style jsx global>{`
        .san-route-viewer .maplibregl-ctrl-top-right {
          top: calc(env(safe-area-inset-top, 0px) + 68px);
          right: 8px;
        }
        .san-route-viewer .maplibregl-ctrl-attrib {
          max-width: min(240px, calc(100vw - 32px));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: rgba(244, 245, 247, 0.7);
          background: rgba(5, 11, 20, 0.72);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          font-size: 10px;
          line-height: 1.3;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .san-route-viewer .maplibregl-ctrl-attrib a {
          color: rgba(244, 245, 247, 0.82);
        }
        .san-route-viewer .maplibregl-ctrl-attrib-button {
          display: block;
          filter: invert(1);
          opacity: 0.8;
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