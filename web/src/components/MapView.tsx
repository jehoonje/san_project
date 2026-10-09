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
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import type { PlaceMapItem } from "@/types/place";

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapViewport = {
  center: [number, number];
  bounds: MapBounds;
};

type MapViewProps = {
  coords: [number, number][];
  places: PlaceMapItem[];
  initialCenter: [number, number];
  active?: boolean;
  onViewportChange?: (viewport: MapViewport) => void;
};

type LocationState = "loading" | "ready" | "error";

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";
const PLACE_PREFIX = "live";

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function validCoord(coord: [number, number]): boolean {
  const [lng, lat] = coord;

  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function createLocationMarkerElement() {
  const container = document.createElement("div");
  container.className = "san-map-location-marker";

  const pulse = document.createElement("div");
  pulse.className = "san-map-location-pulse";

  const dot = document.createElement("div");
  dot.className = "san-map-location-dot";

  container.appendChild(pulse);
  container.appendChild(dot);

  return container;
}

function LocationIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeWidth="1.8"
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
  onViewportChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const viewportCallbackRef = useRef(onViewportChange);

  const mountedRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const hasRealLocationRef = useRef(false);
  const isFollowingRef = useRef(true);

  const latestCoordRef = useRef<[number, number] | null>(null);
  const latestCoordsRef = useRef<[number, number][]>(coords);
  const latestPlacesRef = useRef<PlaceMapItem[]>(places);

  const requestTokenRef = useRef(0);
  const initialRequestStartedRef = useRef(false);

  const [isFollowing, setIsFollowing] = useState(true);
  const [locationState, setLocationState] =
    useState<LocationState>("loading");
  const [locationError, setLocationError] =
    useState<string | null>(null);

  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] =
    useState<string | null>(null);

  const { requestLocation } = usePlaceLocation();

  const centerLng = initialCenter[0];
  const centerLat = initialCenter[1];

  const reducedMotion = useCallback(
    () =>
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
    [],
  );

  const emitViewport = useCallback((map: maplibregl.Map) => {
    const center = map.getCenter();
    const bounds = map.getBounds();
  
    viewportCallbackRef.current?.({
      center: [center.lng, center.lat],
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
    });
  }, []);

  const applyLocation = useCallback(
    (
      map: maplibregl.Map,
      coord: [number, number],
    ) => {
      if (!validCoord(coord)) return;

      latestCoordRef.current = coord;

      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({
          element: createLocationMarkerElement(),
          anchor: "center",
        })
          .setLngLat(coord)
          .addTo(map);
      } else {
        markerRef.current.setLngLat(coord);
      }

      setLocationState("ready");
      setLocationError(null);

      if (!hasRealLocationRef.current) {
        hasRealLocationRef.current = true;

        map.jumpTo({
          center: coord,
          zoom: 14.8,
        });

        emitViewport(map);
        return;
      }

      if (isFollowingRef.current) {
        map.easeTo({
          center: coord,
          duration: reducedMotion() ? 0 : 500,
        });
      }
    },
    [emitViewport, reducedMotion],
  );

  const applyCoords = useCallback(
    (
      map: maplibregl.Map,
      nextCoords: [number, number][],
    ) => {
      const validCoords = nextCoords.filter(validCoord);

      const source = map.getSource(
        ROUTE_SOURCE_ID,
      ) as maplibregl.GeoJSONSource | undefined;

      if (source) {
        source.setData({
          type: "FeatureCollection",
          features:
            validCoords.length >= 2
              ? [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: validCoords,
                    },
                  },
                ]
              : [],
        });
      }

      const latest =
        validCoords[validCoords.length - 1];

      if (latest) {
        applyLocation(map, latest);
      }
    },
    [applyLocation],
  );

  const locate = useCallback(async () => {
    const token = ++requestTokenRef.current;

    setLocationState("loading");
    setLocationError(null);

    const result = await requestLocation();

    if (
      !mountedRef.current ||
      token !== requestTokenRef.current
    ) {
      return;
    }

    if (latestCoordRef.current) {
      const map = mapRef.current;

      if (map) {
        applyLocation(map, latestCoordRef.current);
      }

      setLocationState("ready");
      return;
    }

    if (!result.ok) {
      setLocationState("error");
      setLocationError(result.message);
      return;
    }

    const coord: [number, number] = [
      result.lng,
      result.lat,
    ];

    latestCoordRef.current = coord;

    const map = mapRef.current;

    if (map) {
      applyLocation(map, coord);
    } else {
      setLocationState("ready");
    }
  }, [requestLocation, applyLocation]);

  useEffect(() => {
    viewportCallbackRef.current = onViewportChange;
  }, [onViewportChange]);
  
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestTokenRef.current += 1;
      initialRequestStartedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    mapLoadedRef.current = false;
    hasRealLocationRef.current = false;

    setMapLoading(true);
    setMapError(null);

    let disposed = false;
    let map: maplibregl.Map;

    try {
      maplibregl.setWorkerUrl(
        "/maplibre/maplibre-gl-worker.mjs",
      );

      map = new maplibregl.Map({
        container,
        style: DARK_MAP_STYLE,
        center: [centerLng, centerLat],
        zoom: 13.8,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        trackResize: true,
        dragPan: true,
        scrollZoom: true,
        touchZoomRotate: true,
        doubleClickZoom: true,
        fadeDuration: reducedMotion() ? 0 : 300,
      });
    } catch (error) {
      console.error("[MAP] 초기화 실패:", error);

      setMapLoading(false);
      setMapError("지도를 시작하지 못했어요.");
      return;
    }

    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      "bottom-left",
    );

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    const stopFollowing = () => {
      isFollowingRef.current = false;
      setIsFollowing(false);
    };

    const handleZoomStart = (
      event: maplibregl.MapLibreEvent<
        MouseEvent | TouchEvent | WheelEvent | undefined
      >,
    ) => {
      if (event.originalEvent) {
        stopFollowing();
      }
    };

    const handleViewportSettled = () => {
      if (!disposed) {
        emitViewport(map);
      }
    };

    map.on("dragstart", stopFollowing);
    map.on("zoomstart", handleZoomStart);
    map.on("moveend", handleViewportSettled);

    const resize = () => {
      if (!disposed) {
        map.resize();
      }
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resize)
        : null;

    resizeObserver?.observe(container);

    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener(
      "resize",
      resize,
    );

    const loadingTimer = window.setTimeout(() => {
      if (disposed || mapLoadedRef.current) return;

      setMapLoading(false);
      setMapError(
        "지도 로딩이 지연되고 있어요. 네트워크 상태를 확인해 주세요.",
      );
    }, 20_000);

    map.on("load", () => {
      if (disposed) return;

      window.clearTimeout(loadingTimer);

      try {
        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ff6843",
            "line-width": 6,
            "line-opacity": 0.94,
            "line-blur": 0.4,
          },
        });

        addPlaceLayer(
          map,
          PLACE_PREFIX,
          latestPlacesRef.current,
        );

        mapLoadedRef.current = true;
        setMapLoading(false);
        setMapError(null);

        applyCoords(map, latestCoordsRef.current);

        if (
          latestCoordsRef.current.length === 0 &&
          latestCoordRef.current
        ) {
          applyLocation(map, latestCoordRef.current);
        }

        map.resize();
        emitViewport(map);
      } catch (error) {
        console.error(
          "[MAP] 레이어 초기화 실패:",
          error,
        );

        setMapLoading(false);
        setMapError(
          "지도 표시 요소를 준비하지 못했어요.",
        );
      }
    });

    map.on("error", (event) => {
      console.error("[MAP] 오류:", event.error);
    });

    return () => {
      disposed = true;

      window.clearTimeout(loadingTimer);

      resizeObserver?.disconnect();

      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener(
        "resize",
        resize,
      );

      map.off("dragstart", stopFollowing);
      map.off("zoomstart", handleZoomStart);
      map.off("moveend", handleViewportSettled);

      markerRef.current?.remove();
      markerRef.current = null;

      mapLoadedRef.current = false;
      mapRef.current = null;

      map.remove();
    };
  }, [
    centerLng,
    centerLat,
    applyCoords,
    applyLocation,
    emitViewport,
    reducedMotion,
  ]);

  useEffect(() => {
    latestCoordsRef.current = coords;

    const map = mapRef.current;

    if (map) {
      applyCoords(map, coords);
    }
  }, [coords, applyCoords]);

  useEffect(() => {
    latestPlacesRef.current = places;

    const map = mapRef.current;

    if (!map || !mapLoadedRef.current) return;

    updatePlaceLayer(map, PLACE_PREFIX, places);
  }, [places]);

  useEffect(() => {
    if (
      !active ||
      initialRequestStartedRef.current
    ) {
      return;
    }

    initialRequestStartedRef.current = true;

    if (latestCoordRef.current) {
      setLocationState("ready");
      return;
    }

    void locate();
  }, [active, locate]);

  useEffect(() => {
    const map = mapRef.current;

    if (!active || !map) return;

    const frame = requestAnimationFrame(() => {
      map.resize();
      emitViewport(map);
    });

    const timer = window.setTimeout(() => {
      if (mapRef.current === map) {
        map.resize();
        emitViewport(map);
      }
    }, 320);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [active, emitViewport]);

  function handleRecenter() {
    const map = mapRef.current;
    const latest = latestCoordRef.current;

    isFollowingRef.current = true;
    setIsFollowing(true);

    if (!latest) {
      void locate();
      return;
    }

    if (!map) return;

    map.resize();

    map.easeTo({
      center: latest,
      zoom: 14.8,
      duration: reducedMotion() ? 0 : 500,
    });
  }

  return (
    <div className="san-live-map">
      <style>{`
        .san-live-map {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          background: #07090d;
        }

        .san-live-map-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          touch-action: none;
          background: #07090d;
        }

        .san-map-location-marker {
          position: relative;
          display: grid;
          width: 24px;
          height: 24px;
          place-items: center;
        }

        .san-map-location-pulse {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(87, 155, 255, 0.25);
          animation: san-location-pulse 2s ease-out infinite;
        }

        .san-map-location-dot {
          position: relative;
          width: 16px;
          height: 16px;
          border: 3px solid white;
          border-radius: 50%;
          background: #579bff;
          box-shadow:
            0 2px 8px rgba(45, 116, 255, 0.5),
            0 0 0 1px rgba(0, 0, 0, 0.15);
        }

        .san-map-notice {
          position: absolute;
          z-index: 20;
          top: calc(env(safe-area-inset-top) + 76px);
          left: 50%;
          display: flex;
          align-items: center;
          gap: 10px;
          width: max-content;
          max-width: calc(100% - 32px);
          min-height: 44px;
          padding: 10px 14px;
          color: #f4f5f7;
          background: rgba(10, 13, 18, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 18px;
          box-shadow:
            0 12px 32px rgba(0, 0, 0, 0.28),
            inset 0 1px rgba(255, 255, 255, 0.12);
          transform: translateX(-50%);
          -webkit-backdrop-filter: blur(22px) saturate(135%);
          backdrop-filter: blur(22px) saturate(135%);
        }

        .san-map-notice-text {
          min-width: 0;
          font-size: 13px;
          line-height: 1.45;
        }

        .san-map-spinner {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #ff6843;
          border-radius: 50%;
          animation: san-map-spin 0.8s linear infinite;
        }

        .san-map-retry {
          min-width: 60px;
          min-height: 44px;
          color: #ff7959;
          font-size: 13px;
          font-weight: 650;
          border-radius: 12px;
        }

        .san-map-recenter {
          position: absolute;
          z-index: 15;
          right: 16px;
          bottom: 24%;
          display: grid;
          width: 48px;
          height: 48px;
          place-items: center;
          color: #f4f5f7;
          background: rgba(10, 13, 18, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 18px;
          box-shadow:
            0 10px 28px rgba(0, 0, 0, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.16);
          -webkit-backdrop-filter: blur(22px) saturate(140%);
          backdrop-filter: blur(22px) saturate(140%);
          cursor: pointer;
          transition:
            color 180ms ease,
            transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
            background 180ms ease;
        }

        .san-map-recenter[data-following="true"] {
          color: #79adff;
          background: rgba(20, 38, 62, 0.68);
        }

        .san-map-recenter:active {
          transform: scale(0.93);
        }

        .san-map-recenter:focus-visible,
        .san-map-retry:focus-visible {
          outline: 2px solid #ff6843;
          outline-offset: 3px;
        }

        .san-live-map .maplibregl-ctrl-bottom-left {
          bottom: 22%;
          opacity: 0.55;
        }

        @keyframes san-map-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes san-location-pulse {
          0% {
            transform: scale(0.65);
            opacity: 0.9;
          }

          70%,
          100% {
            transform: scale(1.55);
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .san-map-location-pulse,
          .san-map-spinner {
            animation: none;
          }

          .san-map-recenter {
            transition: none;
          }
        }
      `}</style>

      <div
        ref={containerRef}
        className="san-live-map-canvas"
      />

      {active ? (
        <>
          {mapError ? (
            <div className="san-map-notice" role="alert">
              <span className="san-map-notice-text">
                {mapError}
              </span>
            </div>
          ) : mapLoading ? (
            <div className="san-map-notice" role="status">
              <span
                className="san-map-spinner"
                aria-hidden="true"
              />
              <span className="san-map-notice-text">
                지도를 불러오고 있어요
              </span>
            </div>
          ) : locationState === "loading" ? (
            <div className="san-map-notice" role="status">
              <span
                className="san-map-spinner"
                aria-hidden="true"
              />
              <span className="san-map-notice-text">
                현재 위치를 확인하고 있어요
              </span>
            </div>
          ) : locationState === "error" ? (
            <div className="san-map-notice" role="alert">
              <span className="san-map-notice-text">
                {locationError}
              </span>
              <button
                type="button"
                className="san-map-retry"
                onClick={() => void locate()}
              >
                재시도
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="san-map-recenter"
            data-following={
              isFollowing &&
              locationState === "ready"
            }
            onClick={handleRecenter}
            aria-label="현재 위치로 이동"
            title="현재 위치로 이동"
          >
            <LocationIcon />
          </button>
        </>
      ) : null}
    </div>
  );
}