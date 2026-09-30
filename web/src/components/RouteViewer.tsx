// web/src/components/RouteViewer.tsx
"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SavedRoute } from "@/types/route";

type RouteViewerProps = {
  route: SavedRoute;
  open: boolean;
};

const SOURCE_ID = "saved-route";
const LAYER_ID = "saved-route-line";

function formatDuration(seconds: number | null) {
  if (seconds == null) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function makeDot(color: string) {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = color;
  el.style.border = "3px solid white";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
  return el;
}

export function RouteViewer({ route, open }: RouteViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const coords = route.coordinates;
    if (!container || !coords || coords.length === 0) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    // interactive: false → 드래그/확대축소/회전 등 모든 조작 비활성화
    const map = new maplibregl.Map({
      container,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: coords[0],
      zoom: 12,
      interactive: false,
    });

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
        paint: { "line-color": "#ff5a36", "line-width": 6 },
      });

      new maplibregl.Marker({ element: makeDot("#16a34a") })
        .setLngLat(coords[0])
        .addTo(map);
      new maplibregl.Marker({ element: makeDot("#dc2626") })
        .setLngLat(coords[coords.length - 1])
        .addTo(map);

      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 1200 });
    });

    map.on("error", (e) => {
      console.error("VIEWER MAP ERROR:", e.error);
    });

    return () => map.remove();
  }, [route]);

  const km = ((Number(route.distance_meters) || 0) / 1000).toFixed(2);

  return (
    <div
      className={`absolute inset-0 z-10 bg-white transition duration-300 ease-out ${
        open ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
      }`}
    >
      {/* maplibre-gl.css의 .maplibregl-map { position: relative }가
          Tailwind 클래스를 이기므로 위치/크기는 인라인 스타일로 지정 */}
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 rounded-2xl bg-white/95 px-4 py-3 shadow-lg">
        <p className="truncate text-base font-semibold text-neutral-900">
          {route.title}
        </p>
        <p className="mt-0.5 text-sm text-neutral-500">
          {km} km · {formatDuration(route.duration_seconds)}
        </p>
      </div>
    </div>
  );
}