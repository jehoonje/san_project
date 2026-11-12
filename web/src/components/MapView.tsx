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
  applyPlacePalette,
  startPlacePulse,
  updatePlaceLayer,
} from "@/lib/placeMap";
import { applyMapPalette, buildMapStyle, readMapPalette } from "@/lib/mapStyle";
import { onThemeChange, readToken } from "@/lib/themeTokens";
import {
  MAP_3D,
  apply3DPalette,
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
  EMOTE_SECONDS,
  createAvatarLayer,
  type AvatarLayerHandle,
  type AvatarScreenRect, // [부트 연동]
  type EmoteId,
} from "@/lib/avatar3d";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useDevWalk } from "@/hooks/useDevWalk";
import { DevWalkPanel } from "@/components/DevWalkPanel";
import "@/styles/map-3d.css";
import "@/styles/signal-map.css";
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

/** 근처 산책자 표시용 */
export type PeerMarker = {
  id: string;
  label: string;
  lngLat: [number, number];
  /** idle: 스치는 중 / greeting: 나에게 인사를 건넴 / crossed: 서로 인사를 나눔 */
  state: "idle" | "greeting" | "crossed";
};

type MapViewProps = {
  coords: [number, number][];
  places: PlaceMapItem[];
  initialCenter: [number, number];
  active?: boolean;
  /** 기록 중이면 현재 위치 점이 초록으로 맥동 */
  recording?: boolean;
  onViewportChange?: (viewport: MapViewport) => void;
  onFollowingChange?: (following: boolean) => void;
  onDevMove?: (coord: [number, number]) => void;
  /** [부트 연동] 지도 로드 + 현재 위치 확정 후 호출 */
  onReady?: () => void;
  peers?: PeerMarker[];
  selectedPeerId?: string | null;
  onPeerSelect?: (id: string) => void;
  /** 새 위치를 받을 때마다 호출 (기록·가상 이동·1회 조회 모두) */
  onLocation?: (coord: [number, number]) => void;
};

type PeerMarkerEntry = {
  marker: maplibregl.Marker;
  element: HTMLButtonElement;
  label: HTMLSpanElement;
};

function createPeerElement(id: string, onSelect: (id: string) => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "san-peer";
  const halo = document.createElement("span");
  halo.className = "san-peer-halo";
  const label = document.createElement("span");
  label.className = "san-peer-label";
  element.append(halo, label);
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(id);
  });
  return { element, label };
}

export type MapViewHandle = {
  recenter: () => void;
  focusCurrentLocation: (options: {
    reducedMotion: boolean;
  }) => Promise<void>;
  /** [부트 연동] 지도 위 아바타의 현재 화면 좌표 (캔버스 CSS px) */
  getAvatarScreenRect: () => AvatarScreenRect | null;
  /** 나침반 시작 (iOS 권한 요청은 사용자 제스처 안에서 호출해야 함. 예: 기록 시작 버튼) */
  startCompass: () => void;
  /** 내 아바타가 이 좌표(상대)를 향해 돌아섬. null이면 원래 방향으로 */
  faceToward: (coord: [number, number] | null) => void;
  /** 내 아바타가 상대를 향해 돌아선 뒤 감정 표현을 재생 */
  playSelfEmote: (emote: EmoteId, toward: [number, number]) => void;
  /** 산책자 아바타가 나를 향해 감정 표현을 재생 */
  playPeerEmote: (peerId: string, emote: EmoteId) => void;
};

type LocationState = "loading" | "ready" | "error";

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";
const PLACE_PREFIX = "live";

/** 돌아서는 데 걸리는 시간. 감정 표현은 그 뒤에 시작 */
const FACE_TURN_MS = 420;

function avatarPalette() {
  return {
    self: readToken("--san-avatar", "#6b6a4f"),
    peer: readToken("--san-avatar-peer", "#a9a68a"),
  };
}

const HEADING_SMOOTHING_MS = 180;

/** 새 좌표로 이동하는 데 쓰는 시간 범위 (좌표 도착 간격에 맞춰 선형 보간) */
const MIN_FIX_ANIM_MS = 120;
const MAX_FIX_ANIM_MS = 1500;
/** 화면 속도(걷기/달리기 모션용) 평활화 시간 */
const SPEED_SMOOTHING_MS = 500;
/** 속도가 줄어들 때의 평활화 시간 (멈추면 모션이 빨리 사라지도록 더 짧게) */
const SPEED_FALL_SMOOTHING_MS = 250;
/** 이 시간 동안 새 좌표가 없으면 정지로 간주 */
const SPEED_STALE_MS = 1500;
/** 로컬 가상 이동은 좌표가 프레임마다 오므로 훨씬 짧게 */
const DEV_SPEED_STALE_MS = 200;
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
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      <circle cx="12" cy="12" r="6.5" />
    </svg>
  );
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    coords,
    places,
    initialCenter,
    active = true,
    recording = false,
    onViewportChange,
    onFollowingChange,
    onDevMove,
    onReady, // [부트 연동]
    peers = [],
    selectedPeerId = null,
    onPeerSelect,
    onLocation,
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
  // 감정 표현: 상대를 바라보는 동안의 방향 고정
  const faceRef = useRef<{ coord: [number, number]; until: number } | null>(null);
  const emoteTimerRef = useRef(0);
  const recordingRef = useRef(recording);
  const lastDevRef = useRef<{ c: [number, number]; t: number } | null>(null);

  const requestTokenRef = useRef(0);
  const initialRequestStartedRef = useRef(false);

  // 근처 신호 마커
  const peerMarkersRef = useRef(new Map<string, PeerMarkerEntry>());
  const latestPeersRef = useRef<PeerMarker[]>(peers);
  const selectedPeerRef = useRef<string | null>(selectedPeerId);
  const onPeerSelectRef = useRef(onPeerSelect);
  const onLocationRef = useRef(onLocation);

  useEffect(() => {
    onPeerSelectRef.current = onPeerSelect;
    onLocationRef.current = onLocation;
  }, [onPeerSelect, onLocation]);

  const syncPeerMarkers = useCallback((map: maplibregl.Map) => {
    const entries = peerMarkersRef.current;
    const next = latestPeersRef.current;
    const ids = new Set(next.map((peer) => peer.id));

    for (const [id, entry] of entries) {
      if (!ids.has(id)) {
        entry.marker.remove();
        entries.delete(id);
      }
    }

    for (const peer of next) {
      let entry = entries.get(peer.id);
      if (!entry) {
        const { element, label } = createPeerElement(peer.id, (id) =>
          onPeerSelectRef.current?.(id),
        );
        const marker = new maplibregl.Marker({ element, anchor: "bottom" })
          .setLngLat(peer.lngLat)
          .addTo(map);
        entry = { marker, element, label };
        entries.set(peer.id, entry);
      }
      // 위치는 아바타 레이어가 걸음 속도로 보간하므로 매 프레임 tick에서 맞춤
      entry.label.textContent = peer.label;
      entry.element.dataset.state = peer.state;
      entry.element.dataset.selected = String(selectedPeerRef.current === peer.id);
      entry.element.setAttribute("aria-label", `근처 산책자 ${peer.label}`);
    }

    avatarLayerRef.current?.setPeers(
      next.map((peer) => ({ id: peer.id, lngLat: peer.lngLat })),
    );
  }, []);

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
      groundMarkerRef.current
        .getElement()
        .classList.toggle("is-live", recordingRef.current);
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
      if (isNewFix) onLocationRef.current?.(coord);

      if (!displayCoordRef.current) displayCoordRef.current = coord;
      ensureGroundMarker(map, displayCoordRef.current);

      if (isNewFix) {
        // 1) 속도: 최근 구간의 순변위로 계산 (정지 중 GPS 떨림은 서로 상쇄됨)
        // (로컬 가상 이동은 handleDevMove에서 실제 속도를 직접 설정하므로 건너뜀)
        if (!devOverrideRef.current) {
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
        }

        // 2) 화면 이동: 정지 중의 작은 떨림은 무시, 그 외에는 도착 간격에 맞춰 선형 보간
        const shownNow = displayCoordRef.current ?? coord;
        const skipDisplay =
          !devOverrideRef.current &&
          targetSpeedRef.current === 0 &&
          distanceMeters(shownNow, coord) < STILL_DISPLAY_M;

        if (devOverrideRef.current) {
          // 가상 이동 좌표는 이미 프레임마다 부드럽게 들어오므로 보간 없이 그대로 표시
          displayCoordRef.current = coord;
          fixRef.current = null;
        } else if (!skipDisplay) {
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

      // 로컬 가상 이동 중에는 가상 좌표가 위치를 결정 (실제/뒤처진 좌표로 되돌아가는 것 방지)
      if (devOverrideRef.current) return;

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

      // 실제 이동 속도를 바로 반영 (프레임 간격이 짧을 때만 추정, 멈췄다 재개한 첫 프레임은 건너뜀)
      const nowMs = performance.now();
      const prev = lastDevRef.current;
      if (prev && nowMs - prev.t < 100) {
        const dtS = Math.max((nowMs - prev.t) / 1000, 0.001);
        const inst = Math.min(distanceMeters(prev.c, coord) / dtS, 8);
        targetSpeedRef.current += (inst - targetSpeedRef.current) * 0.3;
      }
      lastDevRef.current = { c: coord, t: nowMs };

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
    const peerEntries = peerMarkersRef.current;
    let map: maplibregl.Map;
    let stopPulse: (() => void) | null = null;
    let raf = 0;

    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      map = new maplibregl.Map({
        container,
        style: buildMapStyle(),
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
    syncPeerMarkers(map);

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

    // 따라가기 중 setCenter가 매 프레임 moveend를 발생시키므로, 상태 갱신은 300ms에 한 번만
    let viewportTimer = 0;
    const handleViewportSettled = () => {
      if (disposed || viewportTimer) return;
      viewportTimer = window.setTimeout(() => {
        viewportTimer = 0;
        if (!disposed) emitViewport(map);
      }, 300);
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
      const clock = performance.now();
      const reduce = reducedMotion();

      // ---- 방향: 걷는 중엔 이동 방향(GPS), 서 있을 땐 나침반 ----
      const gpsH = gpsHeadingRef.current;
      const useGps =
        !devOverrideRef.current &&
        gpsH !== null &&
        (!hasCompassRef.current || speedRef.current > WALK_HEADING_MPS);

      // 감정 표현 중에는 상대를 바라봄 (걷기 시작하면 풀림)
      const face = faceRef.current;
      if (face && (clock > face.until || speedRef.current > WALK_HEADING_MPS)) {
        faceRef.current = null;
      }

      if (faceRef.current && displayCoordRef.current) {
        headingTargetRef.current = bearingBetween(
          displayCoordRef.current,
          faceRef.current.coord,
        );
      } else if (useGps) {
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
      const staleMs = devOverrideRef.current
        ? DEV_SPEED_STALE_MS
        : SPEED_STALE_MS;
      if (clock - lastFixTimeRef.current > staleMs) {
        targetSpeedRef.current = 0;
      }
      const smoothMs =
        targetSpeedRef.current < speedRef.current
          ? SPEED_FALL_SMOOTHING_MS
          : SPEED_SMOOTHING_MS;
      const sk = reduce ? 1 : 1 - Math.exp(-dt / smoothMs);
      speedRef.current += (targetSpeedRef.current - speedRef.current) * sk;
      if (speedRef.current < 0.05) speedRef.current = 0;

      // ---- 위치: 새 좌표 도착 간격에 맞춘 선형 보간 (일정한 속도로 미끄러짐) ----
      // 보간 중인 좌표가 없어도(정지 중 등) 현재 표시 위치로 아바타/마커는 매 프레임 갱신해야 함
      const shown = displayCoordRef.current;
      if (!shown) return;

      let next: [number, number] = shown;
      const fix = fixRef.current;

      if (fix) {
        const t = reduce
          ? 1
          : Math.min(1, Math.max(0, (clock - fix.t0) / fix.dur));
        next = [
          fix.from[0] + (fix.to[0] - fix.from[0]) * t,
          fix.from[1] + (fix.to[1] - fix.from[1]) * t,
        ];
        displayCoordRef.current = next;
      }

      groundMarkerRef.current?.setLngLat(next);

      avatarLayerRef.current?.update({
        lngLat: next,
        headingDeg: headingDisplayRef.current,
        speedMps: speedRef.current,
      });

      // 산책자 터치 영역을 보간 중인 아바타 위치에 맞춤
      for (const [peerId, entry] of peerMarkersRef.current) {
        const at = avatarLayerRef.current?.getPeerLngLat(peerId);
        if (at) entry.marker.setLngLat(at);
      }

      if (isFollowingRef.current && clock > cameraBusyUntilRef.current) {
        map.setCenter(next);
      }
    };
    raf = requestAnimationFrame(tick);

    map.on("load", () => {
      if (disposed) return;

      window.clearTimeout(loadingTimer);

      try {
        const palette = readMapPalette();
        enable3DWorld(map, palette);

        map.addSource(ROUTE_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          // 내 경로: 잉크로 그은 가는 선
          paint: {
            "line-color": palette.route,
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 18, 2.5],
            "line-opacity": 0.95,
          },
        });

        addPlaceLayer(map, PLACE_PREFIX, latestPlacesRef.current, palette);
        if (!reducedMotion()) stopPulse = startPlacePulse(map, PLACE_PREFIX);

        // three.js 아바타: 가장 마지막에 추가해 건물/기둥과 같은 깊이 공간에서 그려짐
        avatarLayerRef.current = createAvatarLayer();
        avatarLayerRef.current.setPalette(avatarPalette());
        map.addLayer(avatarLayerRef.current.layer);
        syncPeerMarkers(map);

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

    // 테마 전환: 지도·건물·장소·경로·아바타를 새 토큰 색으로 다시 칠함
    const stopThemeWatch = onThemeChange(() => {
      if (disposed || !mapLoadedRef.current) return;
      const palette = readMapPalette();
      applyMapPalette(map, palette);
      apply3DPalette(map, palette);
      applyPlacePalette(map, PLACE_PREFIX, palette);
      if (map.getLayer(ROUTE_LAYER_ID)) {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", palette.route);
      }
      avatarLayerRef.current?.setPalette(avatarPalette());
    });

    return () => {
      disposed = true;
      stopThemeWatch();
      window.clearTimeout(emoteTimerRef.current);

      cancelAnimationFrame(raf);
      window.clearTimeout(viewportTimer);
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
      for (const entry of peerEntries.values()) entry.marker.remove();
      peerEntries.clear();
      avatarLayerRef.current = null;
      displayCoordRef.current = null;
      fixRef.current = null;
      fixHistoryRef.current = [];
      lastDevRef.current = null;

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
    syncPeerMarkers,
  ]);

  useEffect(() => {
    latestPeersRef.current = peers;
    selectedPeerRef.current = selectedPeerId;
    const map = mapRef.current;
    if (map) syncPeerMarkers(map);
  }, [peers, selectedPeerId, syncPeerMarkers]);

  useEffect(() => {
    latestCoordsRef.current = coords;
    const map = mapRef.current;
    if (map) applyCoords(map, coords);
  }, [coords, applyCoords]);

  useEffect(() => {
    recordingRef.current = recording;
    groundMarkerRef.current
      ?.getElement()
      .classList.toggle("is-live", recording);
  }, [recording]);

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
    faceToward: (coord) => {
      faceRef.current = coord
        ? { coord, until: performance.now() + 20_000 }
        : null;
    },
    playSelfEmote: (emote, toward) => {
      const reduce = reducedMotion();
      faceRef.current = {
        coord: toward,
        until: performance.now() + (EMOTE_SECONDS[emote] + 1.4) * 1000,
      };
      window.clearTimeout(emoteTimerRef.current);
      // 먼저 상대를 향해 돌아선 다음 몸짓을 시작
      emoteTimerRef.current = window.setTimeout(
        () => avatarLayerRef.current?.playEmote("self", emote),
        reduce ? 0 : FACE_TURN_MS,
      );
    },
    playPeerEmote: (peerId, emote) => {
      avatarLayerRef.current?.playEmote(
        peerId,
        emote,
        displayCoordRef.current ?? latestCoordRef.current,
      );
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