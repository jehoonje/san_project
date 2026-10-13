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
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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

  useEffect(() => {
    const map = mapRef.current;
    if (!open || !map) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => map.resize());
    });
    const animationTimer = setTimeout(() => map.resize(), 320);

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      clearTimeout(animationTimer);
    };
  }, [open]);

  useEffect(() => {
    const container = containerRef.current;
    const coords = route.coordinates ?? [];
    const places = route.route_places ?? [];
    if (!container || !coords.length) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: coords[0],
      zoom: 12,
      interactive: false,
      attributionControl: false,
      trackResize: true,
    });

    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({ compact: false }),
      "top-right",
    );
    map.getCanvas().style.cursor = "default";

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    map.on("load", () => {
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

      map.fitBounds(bounds, {
        padding: { top: 92, right: 44, bottom: 300, left: 44 },
        maxZoom: 17,
        duration: 900,
      });
      requestAnimationFrame(() => map.resize());
    });

    map.on("error", (event) => console.error("VIEWER MAP ERROR:", event.error));

    return () => {
      resizeObserver.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, [route]);

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
          max-width: calc(100vw - 32px);
          padding: 4px 7px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(244, 245, 247, 0.7);
          background: rgba(5, 11, 20, 0.72);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          font-size: 12px;
          line-height: 1.35;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .san-route-viewer .maplibregl-ctrl-attrib a {
          color: rgba(244, 245, 247, 0.82);
        }
        .san-route-viewer .maplibregl-ctrl-attrib-button {
          display: none;
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