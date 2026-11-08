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
import { createPortal } from "react-dom";

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
import {
  createAvatarLayer,
  type AvatarLayerHandle,
  type AvatarScreenRect, // [부트 연동]
} from "@/lib/avatar3d";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useDevWalk } from "@/hooks/useDevWalk";
import { DevWalkPanel } from "@/components/DevWalkPanel";
import { getMockStart, isDevPanelEnabled } from "@/lib/devLocation";
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
  /** [부트 연동] 지도 로드 + 현재 위치 확정 후 호출 */
  onReady?: () => void;
};

export type MapViewHandle = {
  recenter: () => void;
  focusCurrentLocation: (options: {
    reducedMotion: boolean;
  }) => Promise<void>;
  /** [부트 연동] 지도 위 아바타의 현재 화면 좌표 (캔버스 CSS px) */
  getAvatarScreenRect: () => AvatarScreenRect | null;
  /** 나침반 시작 (iOS 권한 요청은 사용자 제스처 안에서 호출해야 함. 예: 기록 시작 버튼) */
  startCompass: () => void;
};

type LocationState = "loading" | "ready" | "error";

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";
const PLACE_PREFIX = "live";

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const HEADING_SMOOTHING_MS = 180;

/** 새 좌표로 이동하는 데 쓰는 시간 범위 (좌표 도착 간격에 맞춰 선형 보간) */
const MIN_FIX_ANIM_MS = 120;
const MAX_FIX_ANIM_MS = 1500;
/** 화면 속도(걷기/달리기 모션용) 평활화 시간 */
const SPEED_SMOOTHING_MS = 500;
/** 이 시간 동안 새 좌표가 없으면 정지로 간주 */
const SPEED_STALE_MS = 2500;
/** 속도 계산에 쓰는 최근 좌표 구간 */
const SPEED_WINDOW_MS = 4000;
/** 이보다 느리면 정지로 판단 (m/s) */
const STILL_MPS = 0.5;
/** 정지 중 이 거리(m) 이하의 변화는 GPS 떨림으로 보고 화면에 반영하지 않음 */
const STILL_DISPLAY_M = 3;
/** 이 거리(m) 이상 이동해야 이동 방향을 갱신 */
const HEADING_ANCHOR_M = 8;
/** 이 속도(m/s) 이상이면 GPS 이동 방향을 나침반보다 우선 */
const WALK_HEADING_MPS = 1.0;

type FixAnim = {
  from: [number, number];
  to: [number, number];
  t0: number;
  dur: number;
};

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
    onReady, // [부트 연동]
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  // 좌표 보간 / 속도 / 방향 추정용
  const fixRef = useRef<FixAnim | null>(null);
  const fixHistoryRef = useRef<{ c: [number, number]; t: number }[]>([]);
  const lastFixTimeRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const headingAnchorRef = useRef<[number, number] | null>(null);
  const gpsHeadingRef = useRef<number | null>(null);
  const compassHeadingRef = useRef(0);
  const devOverrideRef = useRef(false);

  const requestTokenRef = useRef(0);
  const initialRequestStartedRef = useRef(false);

  const [isFollowing, setIsFollowing] = useState(true);
  const [locationState, setLocationState] =
    useState<LocationState>("loading");
  const [, setLocationError] = useState<string | null>(null);

  const [, setMapLoading] = useState(true);
  const [, setMapError] = useState<string | null>(null);

  // [부트 연동] 지도 load 완료 플래그 + onReady 콜백
  const [mapReadyFlag, setMapReadyFlag] = useState(false);
  const onReadyRef = useRef(onReady);

  const { requestLocation } = usePlaceLocation();

  const [devMock, setDevMock] = useState(false);

  useEffect(() => {
    setDevMock(isDevPanelEnabled());
  }, []);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // [부트 연동] 지도 로드 + 위치 확정 시 부트 스크린에 알림
  useEffect(() => {
    if (mapReadyFlag && locationState === "ready") {
      onReadyRef.current?.();
    }
  }, [mapReadyFlag, locationState]);

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

      const now = performance.now();
      const previous = latestCoordRef.current;
      const isNewFix =
        !previous || previous[0] !== coord[0] || previous[1] !== coord[1];

      latestCoordRef.current = coord;

      if (!displayCoordRef.current) displayCoordRef.current = coord;
      ensureGroundMarker(map, displayCoordRef.current);

      if (isNewFix) {
        // 1) 속도: 최근 구간의 순변위로 계산 (정지 중 GPS 떨림은 서로 상쇄됨)
        const hist = fixHistoryRef.current;
        hist.push({ c: coord, t: now });
        while (hist.length > 2 && now - hist[0].t > SPEED_WINDOW_MS) {
          hist.shift();
        }
        if (hist.length >= 2) {
          const first = hist[0];
          const lastItem = hist[hist.length - 1];
          const mps =
            distanceMeters(first.c, lastItem.c) /
            Math.max((lastItem.t - first.t) / 1000, 0.5);
          targetSpeedRef.current = mps < STILL_MPS ? 0 : Math.min(mps, 8);
        }

        // 2) 화면 이동: 정지 중의 작은 떨림은 무시, 그 외에는 도착 간격에 맞춰 선형 보간
        const shownNow = displayCoordRef.current ?? coord;
        const skipDisplay =
          targetSpeedRef.current === 0 &&
          distanceMeters(shownNow, coord) < STILL_DISPLAY_M;

        if (!skipDisplay) {
          const dtFix = lastFixTimeRef.current
            ? now - lastFixTimeRef.current
            : 1000;
          fixRef.current = {
            from: shownNow,
            to: coord,
            t0: now,
            dur: Math.min(MAX_FIX_ANIM_MS, Math.max(MIN_FIX_ANIM_MS, dtFix)),
          };
        }
        lastFixTimeRef.current = now;

        // 3) 이동 방향: 기준점에서 일정 거리 이상 움직였을 때만 갱신 (GPS 노이즈 방지)
        const anchor = headingAnchorRef.current ?? coord;
        headingAnchorRef.current = anchor;
        if (distanceMeters(anchor, coord) >= HEADING_ANCHOR_M) {
          if (!devOverrideRef.current) {
            gpsHeadingRef.current = bearingBetween(anchor, coord);
          }
          headingAnchorRef.current = coord;
        }
      }

      setLocationState("ready");
      setLocationError(null);

      if (!hasRealLocationRef.current) {
        hasRealLocationRef.current = true;
        displayCoordRef.current = coord;
        fixRef.current = null;
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

      // 로컬 가상 이동: 나침반 값 대신 가상 이동 방향을 사용
      devOverrideRef.current = true;
      hasCompassRef.current = true;
      compassHeadingRef.current = heading;

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
      compassHeadingRef.current = deg;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    mapLoadedRef.current = false;
    hasRealLocationRef.current = false;

    setMapReadyFlag(false); // [부트 연동]
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
      const el = container.querySelector(".maplibregl-ctrl-attrib");
      el?.classList.remove("maplibregl-compact-show");
      el?.removeAttribute("open");
    };
    const collapseOnUserMove = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) collapseAttribution();
    };
    showAttribution();
    map.once("load", showAttribution);
    const attributionTimer = window.setTimeout(collapseAttribution, 5000);
    map.on("movestart", collapseOnUserMove);
    map.on("mousedown", collapseAttribution);
    map.on("touchstart", collapseAttribution);
    map.on("wheel", collapseAttribution);

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
      const reduce = reducedMotion();

      // ---- 방향: 걷는 중엔 이동 방향(GPS), 서 있을 땐 나침반 ----
      const gpsH = gpsHeadingRef.current;
      const useGps =
        !devOverrideRef.current &&
        gpsH !== null &&
        (!hasCompassRef.current || speedRef.current > WALK_HEADING_MPS);

      if (useGps) {
        headingTargetRef.current = gpsH;
      } else if (hasCompassRef.current) {
        headingTargetRef.current = compassHeadingRef.current;
      }

      const hk = reduce ? 1 : 1 - Math.exp(-dt / HEADING_SMOOTHING_MS);
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

      // ---- 속도: 새 좌표가 오래 안 오면 정지로 수렴, 아니면 목표 속도로 부드럽게 ----
      if (now - lastFixTimeRef.current > SPEED_STALE_MS) {
        targetSpeedRef.current = 0;
      }
      const sk = reduce ? 1 : 1 - Math.exp(-dt / SPEED_SMOOTHING_MS);
      speedRef.current += (targetSpeedRef.current - speedRef.current) * sk;
      if (speedRef.current < 0.05) speedRef.current = 0;

      // ---- 위치: 새 좌표 도착 간격에 맞춘 선형 보간 (일정한 속도로 미끄러짐) ----
      const fix = fixRef.current;
      if (!fix || !displayCoordRef.current) return;

      const t = reduce
        ? 1
        : Math.min(1, Math.max(0, (now - fix.t0) / fix.dur));
      const next: [number, number] = [
        fix.from[0] + (fix.to[0] - fix.from[0]) * t,
        fix.from[1] + (fix.to[1] - fix.from[1]) * t,
      ];

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
        setMapReadyFlag(true); // [부트 연동]

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
      fixRef.current = null;
      fixHistoryRef.current = [];

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
    // [부트 연동]
    getAvatarScreenRect: () => avatarLayerRef.current?.getScreenRect() ?? null,
    startCompass: () => {
      void startCompass();
    },
  }));

  return (
    <div className="san-map-3d relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {devMock
        ? createPortal(
            <DevWalkPanel
              auto={devWalk.auto}
              onAutoChange={devWalk.setAuto}
              onPress={devWalk.press}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
);
