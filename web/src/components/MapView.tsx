"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  addPlaceLayer,
  updatePlaceLayer,
} from "@/lib/placeMap";
import type { PlaceMapItem } from "@/types/place";

type MapViewProps = {
  coords: [number, number][];
  places: PlaceMapItem[];
  initialCenter: [number, number];
  active?: boolean;
};

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";
const PLACE_PREFIX = "live";

function createLocationMarkerElement() {
  const container =
    document.createElement("div");

  container.style.position = "relative";
  container.style.width = "24px";
  container.style.height = "24px";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";

  const pulse =
    document.createElement("div");

  pulse.style.position = "absolute";
  pulse.style.inset = "0";
  pulse.style.borderRadius = "50%";
  pulse.style.background =
    "rgba(37, 99, 235, 0.2)";
  pulse.style.animation =
    "locationPulse 2s ease-out infinite";

  const dot =
    document.createElement("div");

  dot.style.position = "relative";
  dot.style.width = "16px";
  dot.style.height = "16px";
  dot.style.borderRadius = "50%";
  dot.style.background = "#2563eb";
  dot.style.border = "3px solid white";
  dot.style.boxShadow =
    "0 2px 8px rgba(37, 99, 235, 0.45)";

  container.appendChild(pulse);
  container.appendChild(dot);

  return container;
}

function LocationIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3.5"
        fill="currentColor"
      />

      <circle
        cx="12"
        cy="12"
        r="7.5"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MapView({
  coords,
  places,
  initialCenter,
  active = true,
}: MapViewProps) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const mapRef =
    useRef<maplibregl.Map | null>(null);

  const markerRef =
    useRef<maplibregl.Marker | null>(null);

  const hasRealLocationRef =
    useRef(false);

  const latestCoordRef =
    useRef<[number, number] | null>(null);

  const latestCoordsRef =
    useRef<[number, number][]>(coords);

  const latestPlacesRef =
    useRef<PlaceMapItem[]>(places);

  const isFollowingRef =
    useRef(true);

  const [hasLocation, setHasLocation] =
    useState(false);

  const [isFollowing, setIsFollowing] =
    useState(true);

  const applyCoords = useCallback(
    (
      map: maplibregl.Map,
      nextCoords: [number, number][],
    ) => {
      const source = map.getSource(
        ROUTE_SOURCE_ID,
      ) as
        | maplibregl.GeoJSONSource
        | undefined;

      if (!source) return;

      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates:
            nextCoords.length >= 2
              ? nextCoords
              : [],
        },
      });

      const latest =
        nextCoords[nextCoords.length - 1];

      if (!latest) return;

      latestCoordRef.current = latest;

      if (!markerRef.current) {
        markerRef.current =
          new maplibregl.Marker({
            element:
              createLocationMarkerElement(),
            anchor: "center",
          })
            .setLngLat(latest)
            .addTo(map);
      } else {
        markerRef.current.setLngLat(latest);
      }

      if (
        !hasRealLocationRef.current
      ) {
        map.jumpTo({
          center: latest,
          zoom: 17,
        });

        hasRealLocationRef.current = true;
        isFollowingRef.current = true;

        setHasLocation(true);
        setIsFollowing(true);

        return;
      }

      if (isFollowingRef.current) {
        map.easeTo({
          center: latest,
          duration: 500,
          essential: true,
        });
      }
    },
    [],
  );

  /*
   * Record 탭이 다시 표시될 때 MapLibre가
   * 실제 컨테이너 크기를 다시 계산합니다.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!active || !map) return;

    let secondFrame = 0;

    const firstFrame =
      requestAnimationFrame(() => {
        secondFrame =
          requestAnimationFrame(() => {
            map.resize();
          });
      });

    const timer = setTimeout(() => {
      map.resize();
    }, 320);

    return () => {
      cancelAnimationFrame(firstFrame);

      if (secondFrame) {
        cancelAnimationFrame(
          secondFrame,
        );
      }

      clearTimeout(timer);
    };
  }, [active]);

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) return;

    maplibregl.setWorkerUrl(
      "/maplibre/maplibre-gl-worker.mjs",
    );

    const map = new maplibregl.Map({
      container,
      style:
        "https://tiles.openfreemap.org/styles/liberty",
      center: initialCenter,
      zoom: 15,
      attributionControl: false,
      trackResize: true,

      /*
       * 지도 자체의 사용성은 그대로 유지합니다.
       * 핀치 줌과 드래그는 MapLibre 지도에만 적용됩니다.
       */
      dragPan: true,
      scrollZoom: true,
      touchZoomRotate: true,
      doubleClickZoom: true,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      "top-left",
    );

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable();

    const stopFollowing = () => {
      if (!isFollowingRef.current) {
        return;
      }

      isFollowingRef.current = false;
      setIsFollowing(false);
    };

    map.on(
      "dragstart",
      stopFollowing,
    );

    map.on(
      "zoomstart",
      (event) => {
        if (event.originalEvent) {
          stopFollowing();
        }
      },
    );

    /*
     * WebView 크기, 회전, 탭 전환 등으로
     * 컨테이너 크기가 바뀌면 지도를 재계산합니다.
     */
    const resizeObserver =
      new ResizeObserver(() => {
        map.resize();
      });

    resizeObserver.observe(container);

    const handleViewportResize = () => {
      map.resize();
    };

    window.addEventListener(
      "resize",
      handleViewportResize,
    );

    window.visualViewport?.addEventListener(
      "resize",
      handleViewportResize,
    );

    map.on("load", () => {
      map.resize();

      map.addSource(
        ROUTE_SOURCE_ID,
        {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [],
            },
          },
        },
      );

      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
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
        latestPlacesRef.current,
      );

      applyCoords(
        map,
        latestCoordsRef.current,
      );

      updatePlaceLayer(
        map,
        PLACE_PREFIX,
        latestPlacesRef.current,
      );

      requestAnimationFrame(() => {
        map.resize();
      });
    });

    map.on("idle", () => {
      if (
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        map.resize();
      }
    });

    map.on("error", (event) => {
      console.error(
        "MAP ERROR:",
        event.error,
      );
    });

    return () => {
      resizeObserver.disconnect();

      window.removeEventListener(
        "resize",
        handleViewportResize,
      );

      window.visualViewport?.removeEventListener(
        "resize",
        handleViewportResize,
      );

      markerRef.current = null;
      mapRef.current = null;

      map.remove();
    };
  }, [initialCenter, applyCoords]);

  useEffect(() => {
    latestCoordsRef.current = coords;

    const map = mapRef.current;

    if (
      !map ||
      !map.getSource(ROUTE_SOURCE_ID)
    ) {
      return;
    }

    applyCoords(map, coords);
  }, [coords, applyCoords]);

  useEffect(() => {
    latestPlacesRef.current = places;

    const map = mapRef.current;

    if (!map) return;

    updatePlaceLayer(
      map,
      PLACE_PREFIX,
      places,
    );
  }, [places]);

  function handleRecenter() {
    const map = mapRef.current;
    const latest =
      latestCoordRef.current;

    if (!map || !latest) return;

    isFollowingRef.current = true;
    setIsFollowing(true);

    map.resize();

    map.easeTo({
      center: latest,
      zoom: 17,
      duration: 500,
      essential: true,
    });
  }

  return (
    <div
      className="absolute inset-0 h-full min-h-0 w-full overflow-hidden bg-neutral-100"
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
    >
      <style>{`
        @keyframes mapLoadingSpin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes locationPulse {
          0% {
            transform: scale(0.65);
            opacity: 0.9;
          }

          70% {
            transform: scale(1.55);
            opacity: 0;
          }

          100% {
            transform: scale(1.55);
            opacity: 0;
          }
        }
      `}</style>

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
          touchAction: "none",
        }}
      />

      {!isFollowing &&
        hasLocation && (
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="현재 위치로 이동"
            title="현재 위치로 이동"
            className="absolute right-4 z-[15] flex h-12 w-12 touch-manipulation items-center justify-center rounded-full border border-neutral-200 bg-white text-blue-600 shadow-lg transition duration-150 active:scale-95 active:bg-neutral-50"
            style={{
              bottom:
                "calc(7.5rem + env(safe-area-inset-bottom))",
            }}
          >
            <LocationIcon />
          </button>
        )}

      {!hasLocation && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-9 w-9 rounded-full border-4 border-neutral-200 border-t-[#ff5a36]"
              style={{
                animation:
                  "mapLoadingSpin 0.8s linear infinite",
              }}
            />

            <div className="text-center">
              <p className="text-sm font-medium text-neutral-700">
                현재 위치를 확인하고 있어요
              </p>

              <p className="mt-1 text-xs text-neutral-400">
                잠시만 기다려 주세요
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}