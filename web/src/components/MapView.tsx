"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  addPlaceLayer,
  startPlacePulse,
  updatePlaceLayer,
} from "@/lib/placeMap";
import {
  MAP_3D,
  bearingBetween,
  createGroundMarkerElement,
  disable3DWorld,
  distanceMeters,
  enable3DWorld,
  listenCompass,
  requestCompassPermission,
  shortestAngleDelta,
} from "@/lib/map3d";
import { createAvatarLayer, type AvatarLayerHandle } from "@/lib/avatar3d";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useDevWalk } from "@/hooks/useDevWalk";
import { DevWalkPanel } from "@/components/DevWalkPanel";
import { getMockStart, isDevMockEnabled } from "@/lib/devLocation";
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
  onFollowingChange?: (following: boolean) => void;
  onDevMove?: (coord: [number, number]) => void;
};

export type MapViewHandle = {
  recenter: () => void;
  focusCurrentLocation: (options: {
    reducedMotion: boolean;
  }) => Promise<void>;
};

type LocationState = "loading" | "ready" | "error";

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";
const PLACE_PREFIX = "live";

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const POSITION_SMOOTHING_MS = 140;
const HEADING_SMOOTHING_MS = 180;
const MIN_MOVE_FOR_HEADING_M = 4;

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

export function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    coords,
    places,
    initialCenter,
    active = true,
    onViewportChange,
    onFollowingChange,
    onDevMove,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const groundMarkerRef = useRef<maplibregl.Marker | null>(null);
  const avatarLayerRef = useRef<AvatarLayerHandle | null>(null);
  const viewportCallbackRef = useRef(onViewportChange);

  const mountedRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const hasRealLocationRef = useRef(false);
  const isFollowingRef = useRef(true);

  const latestCoordRef = useRef<[number, number] | null>(null);
  const latestCoordsRef = useRef<[number, number][]>(coords);
  const latestPlacesRef = useRef(places);

  const displayCoordRef = useRef<[number, number] | null>(null);
  const headingTargetRef = useRef(0);
  const headingDisplayRef = useRef(0);
  const hasCompassRef = useRef(false);
  const cameraBusyUntilRef = useRef(0);
  const compassCleanupRef = useRef<(() => void) | null>(null);
  const speedRef = useRef(0);

  const requestTokenRef = useRef(0);
  const initialRequestStartedRef = useRef(false);

  const [isFollowing, setIsFollowing] = useState(true);
  const [locationState, setLocationState] =
    useState<LocationState>("loading");
  const [, setLocationError] = useState<string | null>(null);

  const [, setMapLoading] = useState(true);
  const [, setMapError] = useState<string | null>(null);

  const { requestLocation } = usePlaceLocation();

  const [devMock, setDevMock] = useState(false);

  useEffect(() => {
    setDevMock(isDevMockEnabled());
  }, []);

  const centerLng = initialCenter[0];
  const centerLat = initialCenter[1];

  const reducedMotion = useCallback(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
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

  const ensureGroundMarker = useCallback(
    (map: maplibregl.Map, coord: [number, number]) => {
      if (groundMarkerRef.current) return;

      groundMarkerRef.current = new maplibregl.Marker({
        element: createGroundMarkerElement(),
        anchor: "center",
        pitchAlignment: "map",
        rotationAlignment: "map",
      })
        .setLngLat(coord)
        .addTo(map);
    },
    [],
  );

  const flyToPlayer = useCallback(
    (map: maplibregl.Map, coord: [number, number], reduce: boolean) => {
      const duration = reduce ? 0 : 900;
      cameraBusyUntilRef.current = performance.now() + duration + 80;

      map.easeTo({
        center: coord,
        zoom: MAP_3D.followZoom,
        pitch: MAP_3D.initialPitch,
        duration,
      });
    },
    [],
  );

  const applyLocation = useCallback(
    (map: maplibregl.Map, coord: [number, number]) => {
      if (!validCoord(coord)) return;

      const previous = latestCoordRef.current;
      latestCoordRef.current = coord;

      if (
        previous &&
        !hasCompassRef.current &&
        distanceMeters(previous, coord) >= MIN_MOVE_FOR_HEADING_M
      ) {
        headingTargetRef.current = bearingBetween(previous, coord);
      }

      if (!displayCoordRef.current) displayCoordRef.current = coord;
      ensureGroundMarker(map, displayCoordRef.current);

      setLocationState("ready");
      setLocationError(null);

      if (!hasRealLocationRef.current) {
        hasRealLocationRef.current = true;
        displayCoordRef.current = coord;
        groundMarkerRef.current?.setLngLat(coord);

        map.jumpTo({
          center: coord,
          zoom: MAP_3D.followZoom,
          pitch: MAP_3D.initialPitch,
        });

        emitViewport(map);
      }
    },
    [emitViewport, ensureGroundMarker],
  );

  const applyCoords = useCallback(
    (map: maplibregl.Map, nextCoords: [number, number][]) => {
      const validCoords = nextCoords.filter(validCoord);

      const source = map.getSource(ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;

      if (source) {
        source.setData({
          type: "FeatureCollection",
          features:
            validCoords.length >= 2
              ? [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: { type: "LineString", coordinates: validCoords },
                  },
                ]
              : [],
        });
      }

      const latest = validCoords[validCoords.length - 1];
      if (latest) applyLocation(map, latest);
    },
    [applyLocation],
  );

  const handleDevMove = useCallback(
    (coord: [number, number], heading: number) => {
      const map = mapRef.current;
      if (!map || !mapLoadedRef.current) return;

      hasCompassRef.current = true;
      headingTargetRef.current = heading;
      applyLocation(map, coord);
      onDevMove?.(coord);
    },
    [applyLocation, onDevMove],
  );

  const devWalk = useDevWalk({
    enabled: devMock,
    getCurrent: useCallback(() => latestCoordRef.current, []),
    getStart: getMockStart,
    getMapBearing: useCallback(() => mapRef.current?.getBearing() ?? 0, []),
    onMove: handleDevMove,
  });

  useEffect(() => {
    if (!devMock) return;
    mapRef.current?.keyboard.disable();
  }, [devMock]);

  const locate = useCallback(async () => {
    const token = ++requestTokenRef.current;

    setLocationState("loading");
    setLocationError(null);

    const result = await requestLocation();

    if (!mountedRef.current || token !== requestTokenRef.current) return;

    if (latestCoordRef.current) {
      const map = mapRef.current;
      if (map) applyLocation(map, latestCoordRef.current);
      setLocationState("ready");
      return;
    }

    if (!result.ok) {
      setLocationState("error");
      setLocationError(result.message);
      return;
    }

    const coord: [number, number] = [result.lng, result.lat];
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

  const startCompass = useCallback(async () => {
    if (compassCleanupRef.current) return;

    const granted = await requestCompassPermission();
    if (!granted || !mountedRef.current) return;

    compassCleanupRef.current = listenCompass((deg) => {
      hasCompassRef.current = true;
      headingTargetRef.current = deg;
    });
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
    let stopPulse: (() => void) | null = null;
    let raf = 0;

    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      map = new maplibregl.Map({
        container,
        style: DARK_MAP_STYLE,
        center: [centerLng, centerLat],
        zoom: MAP_3D.initialZoom,
        pitch: MAP_3D.initialPitch,
        maxPitch: MAP_3D.maxPitch,
        bearing: 0,
        attributionControl: false,
        trackResize: true,
        dragPan: true,
        scrollZoom: true,
        touchZoomRotate: true,
        touchPitch: true,
        dragRotate: true,
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
      new maplibregl.AttributionControl({ compact: true }),
      "top-left",
    );

    const attribEl = () =>
      map.getContainer().querySelector(".maplibregl-ctrl-attrib");
    const showAttribution = () => {
      const el = attribEl();
      el?.setAttribute("open", "");
      el?.classList.add("maplibregl-compact-show");
    };
    const collapseAttribution = () => {
      const el = attribEl();
      el?.removeAttribute("open");
      el?.classList.remove("maplibregl-compact-show");
    };
    const collapseOnUserMove = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) collapseAttribution();
    };
    showAttribution();
    map.once("load", showAttribution);
    const attributionTimer = window.setTimeout(collapseAttribution, 5000);
    map.on("movestart", collapseOnUserMove);

    const stopFollowing = () => {
      isFollowingRef.current = false;
      setIsFollowing(false);
    };

    const handleZoomStart = (
      event: maplibregl.MapLibreEvent<
        MouseEvent | TouchEvent | WheelEvent | undefined
      >,
    ) => {
      if (event.originalEvent) stopFollowing();
    };

    const handleViewportSettled = () => {
      if (!disposed) emitViewport(map);
    };

    map.on("dragstart", stopFollowing);
    map.on("zoomstart", handleZoomStart);
    map.on("moveend", handleViewportSettled);

    const resize = () => {
      if (!disposed) map.resize();
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(container);

    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);

    const loadingTimer = window.setTimeout(() => {
      if (disposed || mapLoadedRef.current) return;
      setMapLoading(false);
      setMapError("지도 로딩이 지연되고 있어요. 네트워크 상태를 확인해 주세요.");
    }, 20_000);

    let lastFrame = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (disposed || !mapLoadedRef.current) return;

      const dt = Math.min(now - lastFrame, 100);
      lastFrame = now;

      const hk = reducedMotion() ? 1 : 1 - Math.exp(-dt / HEADING_SMOOTHING_MS);
      headingDisplayRef.current =
        (headingDisplayRef.current +
          shortestAngleDelta(
            headingDisplayRef.current,
            headingTargetRef.current,
          ) *
            hk +
          360) %
        360;
      groundMarkerRef.current?.setRotation(headingDisplayRef.current);

      const target = latestCoordRef.current;
      const shown = displayCoordRef.current;

      if (target && shown) {
        const k = reducedMotion() ? 1 : 1 - Math.exp(-dt / POSITION_SMOOTHING_MS);
        const next: [number, number] = [
          shown[0] + (target[0] - shown[0]) * k,
          shown[1] + (target[1] - shown[1]) * k,
        ];

        // 화면에서 실제로 움직이는 속도(m/s) → 걷기/달리기 모션에 사용
        const stepM = distanceMeters(shown, next);
        const instantMps = dt > 0 ? (stepM / dt) * 1000 : 0;
        speedRef.current += (instantMps - speedRef.current) * 0.1;

        displayCoordRef.current = next;
        groundMarkerRef.current?.setLngLat(next);

        avatarLayerRef.current?.update({
          lngLat: next,
          headingDeg: headingDisplayRef.current,
          speedMps: speedRef.current,
        });

        if (isFollowingRef.current && now > cameraBusyUntilRef.current) {
          map.setCenter(next);
        }
      }
    };
    raf = requestAnimationFrame(tick);

    map.on("load", () => {
      if (disposed) return;

      window.clearTimeout(loadingTimer);

      try {
        enable3DWorld(map);

        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ff6843",
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 18, 9],
            "line-opacity": 0.94,
            "line-blur": 0.4,
          },
        });

        addPlaceLayer(map, PLACE_PREFIX, latestPlacesRef.current);
        if (!reducedMotion()) stopPulse = startPlacePulse(map, PLACE_PREFIX);

        // three.js 아바타: 가장 마지막에 추가해 건물/기둥과 같은 깊이 공간에서 그려짐
        avatarLayerRef.current = createAvatarLayer();
        map.addLayer(avatarLayerRef.current.layer);

        mapLoadedRef.current = true;
        setMapLoading(false);
        setMapError(null);

        applyCoords(map, latestCoordsRef.current);

        if (latestCoordsRef.current.length === 0 && latestCoordRef.current) {
          applyLocation(map, latestCoordRef.current);
        }

        map.resize();
        emitViewport(map);
      } catch (error) {
        console.error("[MAP] 레이어 초기화 실패:", error);
        setMapLoading(false);
        setMapError("지도 표시 요소를 준비하지 못했어요.");
      }
    });

    map.on("error", (event) => {
      console.error("[MAP] 오류:", event.error);
    });

    return () => {
      disposed = true;

      cancelAnimationFrame(raf);
      stopPulse?.();
      compassCleanupRef.current?.();
      compassCleanupRef.current = null;

      window.clearTimeout(loadingTimer);
      window.clearTimeout(attributionTimer);
      map.off("movestart", collapseOnUserMove);

      resizeObserver?.disconnect();

      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);

      map.off("dragstart", stopFollowing);
      map.off("zoomstart", handleZoomStart);
      map.off("moveend", handleViewportSettled);

      groundMarkerRef.current?.remove();
      groundMarkerRef.current = null;
      avatarLayerRef.current = null;
      displayCoordRef.current = null;

      mapLoadedRef.current = false;
      mapRef.current = null;

      try {
        disable3DWorld(map);
      } catch {
        /* map may already be torn down */
      }
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
    if (map) applyCoords(map, coords);
  }, [coords, applyCoords]);

  useEffect(() => {
    latestPlacesRef.current = places;
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    updatePlaceLayer(map, PLACE_PREFIX, places);
  }, [places]);

  useEffect(() => {
    if (!active || initialRequestStartedRef.current) return;

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

    void startCompass();

    if (!latest) {
      void locate();
      return;
    }

    if (!map) return;

    map.resize();
    flyToPlayer(map, displayCoordRef.current ?? latest, reducedMotion());
  }

  const followingCallbackRef = useRef(onFollowingChange);

  useEffect(() => {
    followingCallbackRef.current = onFollowingChange;
  }, [onFollowingChange]);

  useEffect(() => {
    followingCallbackRef.current?.(isFollowing && locationState === "ready");
  }, [isFollowing, locationState]);

  useImperativeHandle(ref, () => ({
    recenter: handleRecenter,
    focusCurrentLocation: async ({ reducedMotion: reduce }) => {
      isFollowingRef.current = true;
      setIsFollowing(true);

      const map = mapRef.current;
      const latest = latestCoordRef.current;

      if (map && latest) {
        map.resize();
        flyToPlayer(map, displayCoordRef.current ?? latest, reduce);
        return;
      }

      await locate();
    },
  }));

  return (
    <div className="san-map-3d relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {devMock ? (
        <DevWalkPanel
          auto={devWalk.auto}
          onAutoChange={devWalk.setAuto}
          onPress={devWalk.press}
        />
      ) : null}
    </div>
  );
});