// web/src/components/RouteViewer.tsx
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

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) {
    return `${minutes}분 ${remainingSeconds}초`;
  }

  return `${remainingSeconds}초`;
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

export function RouteViewer({
  route,
  open,
}: RouteViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const coords = route.coordinates;
    const places = route.route_places ?? [];

    if (!container || !coords || coords.length === 0) {
      return;
    }

    maplibregl.setWorkerUrl(
      "/maplibre/maplibre-gl-worker.mjs",
    );

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
          geometry: {
            type: "LineString",
            coordinates: coords,
          },
        },
      });

      map.addLayer({
        id: LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ff5a36",
          "line-width": 6,
        },
      });

      addPlaceLayer(map, PLACE_PREFIX, places);

      new maplibregl.Marker({ element: makeDot("#16a34a") })
        .setLngLat(coords[0])
        .addTo(map);

      new maplibregl.Marker({ element: makeDot("#dc2626") })
        .setLngLat(coords[coords.length - 1])
        .addTo(map);

      const bounds = new maplibregl.LngLatBounds(
        coords[0],
        coords[0],
      );

      for (const coord of coords) {
        bounds.extend(coord);
      }

      for (const place of places) {
        bounds.extend([place.lng, place.lat]);
      }

      map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 17,
        duration: 1200,
      });
    });

    map.on("error", (event) => {
      console.error("VIEWER MAP ERROR:", event.error);
    });

    return () => map.remove();
  }, [route]);

  const km = (
    (Number(route.distance_meters) || 0) / 1000
  ).toFixed(2);
  const placeCount = route.route_places?.length ?? 0;

  return (
    <div
      className={`absolute inset-0 z-10 bg-white transition duration-300 ease-out ${
        open
          ? "scale-100 opacity-100"
          : "scale-[0.98] opacity-0"
      }`}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 rounded-2xl bg-white/95 px-4 py-3 shadow-lg">
        <p className="truncate text-base font-semibold text-neutral-900">
          {route.title}
        </p>
        <p className="mt-0.5 text-sm text-neutral-500">
          {km} km · {formatDuration(route.duration_seconds)}
          {placeCount > 0 ? ` · 장소 ${placeCount}개` : ""}
        </p>
      </div>
    </div>
  );
}