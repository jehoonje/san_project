"use client";

import {
  useEffect,
  useRef,
} from "react";
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

function formatDuration(
  seconds: number | null,
) {
  if (seconds == null) return "-";

  const totalSeconds = Math.max(
    0,
    Math.round(seconds),
  );

  const hours = Math.floor(
    totalSeconds / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const remainingSeconds =
    totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0
      ? `${hours}시간 ${minutes}분`
      : `${hours}시간`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0
      ? `${minutes}분 ${remainingSeconds}초`
      : `${minutes}분`;
  }

  return `${remainingSeconds}초`;
}

function makeDot(color: string) {
  const container =
    document.createElement("div");

  container.style.position = "relative";
  container.style.width = "22px";
  container.style.height = "22px";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";

  const ring = document.createElement("div");

  ring.style.position = "absolute";
  ring.style.inset = "1px";
  ring.style.borderRadius = "50%";
  ring.style.background = color;
  ring.style.opacity = "0.18";

  const dot = document.createElement("div");

  dot.style.position = "relative";
  dot.style.width = "15px";
  dot.style.height = "15px";
  dot.style.borderRadius = "50%";
  dot.style.background = color;
  dot.style.border = "3px solid white";
  dot.style.boxShadow =
    "0 2px 7px rgba(0, 0, 0, 0.3)";

  container.appendChild(ring);
  container.appendChild(dot);

  return container;
}

function RouteIcon() {
  return (
    <svg
      width="16"
      height="16"
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

      <circle
        cx="6"
        cy="19"
        r="2"
        fill="currentColor"
      />

      <circle
        cx="9"
        cy="7"
        r="2"
        fill="currentColor"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
      />

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
      width="16"
      height="16"
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

      <circle
        cx="12"
        cy="9"
        r="2.4"
        fill="currentColor"
      />
    </svg>
  );
}

export function RouteViewer({
  route,
  open,
}: RouteViewerProps) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const mapRef =
    useRef<maplibregl.Map | null>(null);

  /*
   * RouteViewer가 애니메이션으로 열린 다음
   * 실제 컨테이너 크기에 맞춰 지도를 다시 계산합니다.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!open || !map) return;

    let secondFrame = 0;

    const firstFrame =
      requestAnimationFrame(() => {
        secondFrame =
          requestAnimationFrame(() => {
            map.resize();
          });
      });

    const animationTimer = setTimeout(() => {
      map.resize();
    }, 320);

    return () => {
      cancelAnimationFrame(firstFrame);

      if (secondFrame) {
        cancelAnimationFrame(secondFrame);
      }

      clearTimeout(animationTimer);
    };
  }, [open]);

  useEffect(() => {
    const container =
      containerRef.current;

    const coords =
      route.coordinates ?? [];

    const places =
      route.route_places ?? [];

    if (
      !container ||
      coords.length === 0
    ) {
      return;
    }

    maplibregl.setWorkerUrl(
      "/maplibre/maplibre-gl-worker.mjs",
    );

    const map = new maplibregl.Map({
      container,
      style:
        "https://tiles.openfreemap.org/styles/liberty",
      center: coords[0],
      zoom: 12,
      interactive: false,
      attributionControl: false,
      trackResize: true,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      "top-left",
    );

    map.getCanvas().style.cursor =
      "default";

    /*
     * 부모 레이아웃의 크기가 바뀌면 MapLibre
     * 캔버스도 즉시 같은 크기로 맞춥니다.
     */
    const resizeObserver =
      new ResizeObserver(() => {
        map.resize();
      });

    resizeObserver.observe(container);

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
          "line-opacity": 0.95,
        },
      });

      addPlaceLayer(
        map,
        PLACE_PREFIX,
        places,
      );

      new maplibregl.Marker({
        element: makeDot("#16a34a"),
        anchor: "center",
      })
        .setLngLat(coords[0])
        .addTo(map);

      if (coords.length > 1) {
        new maplibregl.Marker({
          element: makeDot("#dc2626"),
          anchor: "center",
        })
          .setLngLat(
            coords[coords.length - 1],
          )
          .addTo(map);
      }

      const bounds =
        new maplibregl.LngLatBounds(
          coords[0],
          coords[0],
        );

      for (const coord of coords) {
        bounds.extend(coord);
      }

      for (const place of places) {
        bounds.extend([
          place.lng,
          place.lat,
        ]);
      }

      /*
       * 하단 정보 카드가 경로와 장소를
       * 가리지 않도록 아래 여백을 크게 둡니다.
       */
      map.fitBounds(bounds, {
        padding: {
          top: 72,
          right: 48,
          bottom: 180,
          left: 48,
        },
        maxZoom: 17,
        duration: 900,
      });

      requestAnimationFrame(() => {
        map.resize();
      });
    });

    map.on("error", (event) => {
      console.error(
        "VIEWER MAP ERROR:",
        event.error,
      );
    });

    return () => {
      resizeObserver.disconnect();

      mapRef.current = null;
      map.remove();
    };
  }, [route]);

  const distanceMeters =
    Number(route.distance_meters) || 0;

  const km = (
    distanceMeters / 1000
  ).toFixed(2);

  const placeCount =
    route.route_places?.length ?? 0;

  return (
    <div
      className={`absolute inset-0 z-10 h-full min-h-0 w-full overflow-hidden bg-white transition duration-300 ease-out ${
        open
          ? "visible scale-100 opacity-100"
          : "pointer-events-none invisible scale-[0.98] opacity-0"
      }`}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
      aria-hidden={!open}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 h-full min-h-0 w-full"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: "100%",
          height: "100%",
          minHeight: 0,
        }}
      />

      <div
        className="pointer-events-auto absolute inset-x-4 z-20 rounded-3xl border border-white/70 bg-white/95 px-4 py-4 shadow-[0_10px_35px_rgba(0,0,0,0.18)] backdrop-blur-xl"
        style={{
          bottom:
            "calc(1rem + env(safe-area-inset-bottom))",
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <p className="truncate text-base font-semibold text-neutral-900">
          {route.title}
        </p>

        <div
          className={`mt-3 grid gap-2 ${
            placeCount > 0
              ? "grid-cols-3"
              : "grid-cols-2"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2.5">
            <span className="shrink-0 text-[#ff5a36]">
              <RouteIcon />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-medium text-neutral-400">
                거리
              </p>

              <p className="truncate text-sm font-semibold text-neutral-800">
                {km} km
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2.5">
            <span className="shrink-0 text-blue-500">
              <ClockIcon />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-medium text-neutral-400">
                시간
              </p>

              <p className="truncate text-sm font-semibold text-neutral-800">
                {formatDuration(
                  route.duration_seconds,
                )}
              </p>
            </div>
          </div>

          {placeCount > 0 && (
            <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2.5">
              <span className="shrink-0 text-emerald-600">
                <PlaceIcon />
              </span>

              <div className="min-w-0">
                <p className="text-[10px] font-medium text-neutral-400">
                  장소
                </p>

                <p className="truncate text-sm font-semibold text-neutral-800">
                  {placeCount}개
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}