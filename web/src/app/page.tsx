"use client";

import "./map-home.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { MapTabLayout, type MainTab } from "@/components/MapTabLayout";
import { AnalysisReport } from "@/components/AnalysisReport";
import {
  MapView,
  LocationIcon,
  type MapViewHandle,
  type MapViewport,
  type PeerMarker,
} from "@/components/MapView";
import { EmoteSheet } from "@/components/signal/EmoteSheet";
import { SignalNoticeBanner } from "@/components/signal/SignalNoticeBanner";
import { TrackingControls } from "@/components/TrackingControls";
import { RecordHud } from "@/components/RecordHud";
import { DwellPrompt } from "@/components/DwellPrompt";
import { TopBar } from "@/components/TopBar";
import { SideDrawer } from "@/components/SideDrawer";
import { RegionOverview } from "@/components/RegionOverview";
import { RouteGrid, type RouteViewMode } from "@/components/RouteGrid";
import { RouteViewer } from "@/components/RouteViewer";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import {
  PlaceSaveSheet,
  type PlaceSheetState,
} from "@/components/PlaceSaveSheet";
import BootIntroScreen, { type BootMode } from "@/components/BootIntroScreen"; // [부트 연동]

import { useRegionSummary } from "@/hooks/useRegionSummary";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useSession } from "@/hooks/useSession";
import { useSignal } from "@/hooks/useSignal";
import { isDevPanelEnabled } from "@/lib/devLocation";

import { makePlaceKey } from "@/lib/placeKey";
import { supabase } from "@/lib/supabaseClient";
import { postToNative } from "@/lib/nativeBridge";
import { screenMotion, toastMotion } from "@/lib/motion";
import { haversineMeters, type LngLat } from "@/lib/geo";
import {
  DWELL_RADIUS_METERS,
  DWELL_THRESHOLD_MS,
  DwellDetector,
  dwellMinutesOf,
  type DwellCluster,
} from "@/lib/dwell";
import {
  getGuestId,
  isGuestMode,
  leaveGuestMode,
  onGuestChange,
} from "@/lib/guest";
import {
  importGuestRoutes,
  saveRoute,
  type RouteOwner,
} from "@/lib/routeStore";
import type { EmoteId } from "@/lib/signal";

import type { AppToWebMessage, TrackingStatus } from "@/types/tracking";
import type { SavedRoute } from "@/types/route";
import type { PlaceCategory, PlaceDraft } from "@/types/place";

const INITIAL_CENTER: [number, number] = [126.978, 37.5665];
const VIEWER_ANIM_MS = 300;
const ROUTE_VIEW_KEY = "san-route-view";
// 근처 신호는 기본으로 켜져 있고, 계정 시트에서 끌 수 있음 ("0"이면 꺼짐)
const SIGNAL_KEY = "san-signal-on";
// 신호 위치 갱신: 이만큼 움직였거나 이 시간이 지나면 새 위치로
const SIGNAL_MOVE_M = 25;
const SIGNAL_REFRESH_MS = 40_000;

// 로컬 가상 이동 시 경로에 점을 추가하는 최소 간격(m)
const DEV_MIN_STEP_M = 3;

// 체류 감지: 개발용 가상 이동에서는 20초만 머물러도 제안
const DEV_DWELL_THRESHOLD_MS = 20 * 1000;
const DWELL_CHECK_INTERVAL_MS = 5000;
// 이미 저장한 장소 근처라면 다시 묻지 않음
const NEAR_SAVED_PLACE_METERS = 50;

type DwellPromptState = {
  clusterId: number;
  center: LngLat;
  startedAt: number;
  minutes: number;
};

// [부트 연동] 웹뷰 세션당 1회 재생 / 풀 버전은 최초 1회만
const BOOT_PLAYED_KEY = "san-boot-played";
const BOOT_FULL_SEEN_KEY = "san-boot-full-seen";

type PendingRoute = {
  coords: [number, number][];
  places: PlaceDraft[];
  startedAt: string;
  endedAt: string;
};

function calcTotalDistance(coords: [number, number][]) {
  let total = 0;

  for (let index = 1; index < coords.length; index += 1) {
    total += haversineMeters(coords[index - 1], coords[index]);
  }

  return Math.round(total);
}

export default function Home() {
  const [tab, setTab] = useState<MainTab>("map");
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id ?? null;

  // ── 게스트 모드: 로그인 없이 이 기기에만 기록 ─────────────
  const [guestFlag, setGuestFlag] = useState(false);
  const [guestChecked, setGuestChecked] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const on = isGuestMode();
      setGuestFlag(on);
      setGuestId(on ? getGuestId() : null);
      setGuestChecked(true);
    };
    queueMicrotask(read);
    return onGuestChange(read);
  }, []);

  const isGuest = !session && guestFlag;
  const ownerId = userId ?? (isGuest ? guestId : null);
  const owner = useMemo<RouteOwner | null>(
    () =>
      userId ? { kind: "user", userId } : isGuest ? { kind: "guest" } : null,
    [userId, isGuest],
  );

  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [places, setPlaces] = useState<PlaceDraft[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<PendingRoute | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [placeSheet, setPlaceSheet] = useState<PlaceSheetState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [routeView, setRouteView] = useState<RouteViewMode>("grid");
  const reduceMotion = useReducedMotion();

  // 마지막으로 고른 보기 방식(카드형/목록형) 복원
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ROUTE_VIEW_KEY);
      if (saved === "log" || saved === "grid") {
        queueMicrotask(() => setRouteView(saved));
      }
    } catch {
      // 저장소 접근 불가 시 기본값(카드형)
    }
  }, []);

  function handleToggleRouteView() {
    setRouteView((prev) => {
      const next = prev === "grid" ? "log" : "grid";
      try {
        window.localStorage.setItem(ROUTE_VIEW_KEY, next);
      } catch {
        // 무시
      }
      return next;
    });
  }

  // ── 근처 신호 ─────────────────────────────
  const [signalOn, setSignalOn] = useState(true);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [selfPosition, setSelfPosition] = useState<[number, number] | null>(
    null,
  );
  const [devGhost, setDevGhost] = useState(false);
  const lastSelfRef = useRef<{ coord: [number, number]; at: number } | null>(
    null,
  );

  // 신호 켜짐 여부 복원 + 개발용 가상 산책자 (?mock=1, 끄기 ?ghost=0)
  useEffect(() => {
    let on = true;
    try {
      on = window.localStorage.getItem(SIGNAL_KEY) !== "0";
    } catch {
      on = true;
    }
    const ghost =
      isDevPanelEnabled() &&
      new URLSearchParams(window.location.search).get("ghost") !== "0";
    queueMicrotask(() => {
      setSignalOn(on);
      setDevGhost(ghost);
    });
  }, []);

  const handleSelfLocation = useCallback((coord: [number, number]) => {
    const last = lastSelfRef.current;
    const now = Date.now();
    if (
      last &&
      haversineMeters(last.coord, coord) < SIGNAL_MOVE_M &&
      now - last.at < SIGNAL_REFRESH_MS
    ) {
      return;
    }
    lastSelfRef.current = { coord, at: now };
    setSelfPosition(coord);
  }, []);

  function handleToggleSignal() {
    const next = !signalOn;
    setSignalOn(next);
    if (!next) {
      setSelectedPeerId(null);
      mapViewRef.current?.faceToward(null);
    }
    try {
      window.localStorage.setItem(SIGNAL_KEY, next ? "1" : "0");
    } catch {
      // 무시
    }
  }

  // [부트 연동] 부트 스크린 상태 (null이면 재생 안 함)
  const [bootMode, setBootMode] = useState<BootMode | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [viewport, setViewport] = useState<MapViewport>({
    center: INITIAL_CENTER,
    bounds: {
      west: 126.82,
      south: 37.42,
      east: 127.13,
      north: 37.72,
    },
  });

  const [summaryRevision, setSummaryRevision] = useState(0);

  const regionSummary = useRegionSummary(viewport, userId, summaryRevision);

  const startedAtRef = useRef<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const placeTokenRef = useRef(0);
  const cameraRequestRef = useRef(0);
  const mapViewRef = useRef<MapViewHandle>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const tabRef = useRef<MainTab>("map");
  const mountedRef = useRef(true);

  const coordsRef = useRef<[number, number][]>([]);
  const placesRef = useRef<PlaceDraft[]>([]);

  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── 체류 감지: 한 곳에 오래 머물면 장소 저장을 제안 ─────────
  const [dwellPrompt, setDwellPrompt] = useState<DwellPromptState | null>(null);
  const dwellPromptRef = useRef<DwellPromptState | null>(null);
  const dwellDetectorRef = useRef<DwellDetector | null>(null);
  // 체류 구간 id → 그 구간에서 저장한 장소의 savedAt
  const dwellSavedRef = useRef(new Map<number, string>());

  function getDwellDetector() {
    if (!dwellDetectorRef.current) {
      dwellDetectorRef.current = new DwellDetector(
        DWELL_RADIUS_METERS,
        isDevPanelEnabled() ? DEV_DWELL_THRESHOLD_MS : DWELL_THRESHOLD_MS,
      );
    }
    return dwellDetectorRef.current;
  }

  function showDwellPrompt(next: DwellPromptState | null) {
    dwellPromptRef.current = next;
    setDwellPrompt(next);
  }

  // 체류 구간이 끝나면, 그 구간에서 저장한 장소의 체류 시간을 최종값으로 갱신
  function finishDwell(cluster: DwellCluster | null) {
    if (!cluster) return;

    if (dwellPromptRef.current?.clusterId === cluster.id) {
      showDwellPrompt(null);
    }

    const savedAt = dwellSavedRef.current.get(cluster.id);
    if (!savedAt) return;
    dwellSavedRef.current.delete(cluster.id);

    const minutes = dwellMinutesOf(cluster);
    placesRef.current = placesRef.current.map((place) =>
      place.savedAt === savedAt
        ? { ...place, dwellMinutes: Math.max(place.dwellMinutes ?? 0, minutes) }
        : place,
    );
    setPlaces(placesRef.current);
  }

  function observeDwell(point: LngLat | undefined) {
    if (statusRef.current !== "recording" || !point) return;
    finishDwell(getDwellDetector().observe(point, Date.now()));
  }

  const observeDwellRef = useRef(observeDwell);
  useEffect(() => {
    observeDwellRef.current = observeDwell;
  });

  // [부트 연동] 재생 방식 결정: 이 웹뷰 세션에서 이미 재생했으면 생략,
  // 처음 실행이면 full, 이후에는 quick
  useEffect(() => {
    try {
      if (sessionStorage.getItem(BOOT_PLAYED_KEY)) return;
      setBootMode(localStorage.getItem(BOOT_FULL_SEEN_KEY) ? "quick" : "full");
    } catch {
      setBootMode("quick");
    }
  }, []);

  // [부트 연동] 부트 종료 시 기록
  function handleBootComplete() {
    try {
      sessionStorage.setItem(BOOT_PLAYED_KEY, "1");
      localStorage.setItem(BOOT_FULL_SEEN_KEY, "1");
    } catch {
      /* 저장 불가 환경은 무시 */
    }
    setBootMode(null);
  }

  // 로컬 가상 이동: 앱의 LOCATION_UPDATE처럼 기록 중일 때만 경로에 좌표를 쌓음
  const handleDevMove = useCallback((coord: [number, number]) => {
    if (statusRef.current !== "recording") return;

    const list = coordsRef.current;
    const last = list[list.length - 1];

    if (last && haversineMeters(last, coord) < DEV_MIN_STEP_M) return;

    const next: [number, number][] = [...list, coord];
    coordsRef.current = next;
    setCoords(next);
    observeDwellRef.current(coord);
  }, []);

  const handleNativeMessage = useCallback((data: AppToWebMessage) => {
    if (data.type === "LOCATION_UPDATE") {
      coordsRef.current = data.coords;
      setCoords(data.coords);
      observeDwellRef.current(data.coords[data.coords.length - 1]);
    }

    if (data.type === "STATUS_ACK") {
      setStatus(data.status);
    }
  }, []);

  const { sendToApp } = useNativeBridge(handleNativeMessage);
  const { requestLocation } = usePlaceLocation();

  const signalActive = signalOn && Boolean(ownerId);
  const signal = useSignal({
    ownerId,
    remote: Boolean(userId),
    enabled: signalActive,
    position: selfPosition,
    region: regionSummary.displayName || null,
    ghost: devGhost,
  });

  // 신호가 켜져 있는 동안 기록 중이 아니어도 위치를 가끔 새로 받음
  useEffect(() => {
    if (!signalActive) return;
    let cancelled = false;
    const tick = async () => {
      const result = await requestLocation();
      if (!cancelled && result.ok) handleSelfLocation([result.lng, result.lat]);
    };
    void tick();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, SIGNAL_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [signalActive, requestLocation, handleSelfLocation]);

  const peerMarkers = useMemo<PeerMarker[]>(
    () =>
      signal.peers.map((peer) => {
        const relation = signal.relations[peer.sid];
        const state: PeerMarker["state"] = relation?.crossed
          ? "crossed"
          : relation?.theirs && !relation.mine
            ? "greeting"
            : "idle";
        return { id: peer.sid, label: peer.cs, lngLat: peer.pos, state };
      }),
    [signal.peers, signal.relations],
  );

  const selectedPeer = selectedPeerId
    ? (signal.peers.find((peer) => peer.sid === selectedPeerId) ?? null)
    : null;

  // 산책자를 고르면 내 아바타가 그쪽으로 돌아섬
  const handleSelectPeer = useCallback(
    (sid: string) => {
      const peer = signal.peers.find((p) => p.sid === sid);
      if (!peer) return;
      setSelectedPeerId(sid);
      mapViewRef.current?.faceToward(peer.pos);
    },
    [signal.peers],
  );

  const handleClosePeer = useCallback(() => {
    setSelectedPeerId(null);
    mapViewRef.current?.faceToward(null);
  }, []);

  // 고른 산책자가 범위를 벗어나 사라지면 시트도 닫음
  useEffect(() => {
    if (selectedPeerId && !selectedPeer) {
      queueMicrotask(() => setSelectedPeerId(null));
      mapViewRef.current?.faceToward(null);
    }
  }, [selectedPeerId, selectedPeer]);

  function handleEmote(emote: EmoteId) {
    if (!selectedPeer) return;
    signal.sendEmote(selectedPeer.sid, emote);
    mapViewRef.current?.playSelfEmote(emote, selectedPeer.pos);
  }

  // 상대가 건넨 감정 표현: 그 아바타가 나를 향해 돌아서 재생
  const incoming = signal.incoming;
  useEffect(() => {
    if (!incoming) return;
    mapViewRef.current?.playPeerEmote(incoming.sid, incoming.emote);
  }, [incoming]);

  useEffect(() => {
    if (!sessionLoading && guestChecked && !session && !guestFlag) {
      router.replace("/login");
    }
  }, [sessionLoading, guestChecked, session, guestFlag, router]);

  // 게스트로 남긴 기록이 있으면 로그인한 계정으로 옮김
  useEffect(() => {
    if (!userId || !guestFlag) return;
    let cancelled = false;
    void importGuestRoutes()
      .then((moved) => {
        leaveGuestMode();
        if (!cancelled && moved > 0) {
          showToastRef.current(`게스트 기록 ${moved}개를 계정으로 옮겼어요.`);
          setSummaryRevision((current) => current + 1);
        }
      })
      .catch(() => leaveGuestMode());
    return () => {
      cancelled = true;
    };
  }, [userId, guestFlag]);

  useEffect(() => {
    if (ownerId) {
      postToNative({ type: "WEB_READY" });
    }
  }, [ownerId]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      placeTokenRef.current += 1;
      cameraRequestRef.current += 1;

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  function resetRecording() {
    coordsRef.current = [];
    placesRef.current = [];
    startedAtRef.current = null;
    dwellDetectorRef.current?.reset();
    dwellSavedRef.current.clear();
    showDwellPrompt(null);

    setCoords([]);
    setPlaces([]);
    setStartedAt(null);
  }

  function showToast(message: string) {
    if (!mountedRef.current) return;

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(message);

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  });

  function handleStart() {
    if (isSaving || pendingRoute) return;

    const isResume = status === "paused" && startedAtRef.current !== null;

    if (!isResume) {
      startedAtRef.current = new Date().toISOString();
      setStartedAt(startedAtRef.current);

      coordsRef.current = [];
      placesRef.current = [];
      dwellSavedRef.current.clear();

      setCoords([]);
      setPlaces([]);
    }

    // 일시정지했던 시간은 체류로 치지 않도록 새로 시작
    dwellDetectorRef.current?.reset();
    statusRef.current = "recording";

    sendToApp({ type: "START_TRACKING" });
    setStatus("recording");
    mapViewRef.current?.startCompass();

    // 움직이지 않고 서 있어도 체류를 셀 수 있게 지금 자리부터 관찰
    observeDwell(lastSelfRef.current?.coord);
  }

  function handlePause() {
    if (isSaving || pendingRoute) return;

    finishDwell(getDwellDetector().reset());
    showDwellPrompt(null);
    statusRef.current = "paused";

    sendToApp({ type: "PAUSE_TRACKING" });
    setStatus("paused");
  }

  function handleStop() {
    if (isSaving || pendingRoute) return;

    const startedAt = startedAtRef.current;
    const endedAt = new Date().toISOString();

    finishDwell(getDwellDetector().reset());
    showDwellPrompt(null);
    statusRef.current = "idle";

    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");

    // 체류 시간까지 반영된 최종 목록
    const finalCoords = [...coordsRef.current];
    const finalPlaces = [...placesRef.current];

    // 진행 중인 장소 위치 요청도 무효화합니다.
    placeTokenRef.current += 1;
    setPlaceSheet(null);

    if (finalCoords.length < 2 || !startedAt) {
      resetRecording();
      showToast("저장하기엔 기록이 너무 짧아요.");
      return;
    }

    setSaveError(null);

    setPendingRoute({
      coords: finalCoords,
      places: finalPlaces,
      startedAt,
      endedAt,
    });
  }

  async function handleConfirmTitle(title: string) {
    if (!pendingRoute || !owner || isSaving) return;

    const {
      coords: finalCoords,
      places: finalPlaces,
      startedAt,
      endedAt,
    } = pendingRoute;

    setIsSaving(true);
    setSaveError(null);

    try {
      const distanceMeters = calcTotalDistance(finalCoords);
      const durationSeconds = Math.max(
        0,
        Math.round(
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
        ),
      );

      const enrichedPlaces = await Promise.all(
        finalPlaces.map(async (place) => {
          try {
            const response = await fetch(
              `/api/region-dong?lat=${place.lat}&lng=${place.lng}`,
            );

            const json = response.ok ? await response.json() : null;

            return {
              ...place,
              regionDong: json?.regionDong ?? null,
            };
          } catch {
            return place;
          }
        }),
      );

      await saveRoute(owner, {
        title,
        coordinates: finalCoords,
        distanceMeters,
        durationSeconds,
        startedAt,
        endedAt,
        places: enrichedPlaces,
      });

      if (!mountedRef.current) return;

      setPendingRoute(null);
      resetRecording();
      setSummaryRevision((current) => current + 1);

      showToast("루트를 저장했어요.");
    } catch (error) {
      console.error("루트 저장 실패:", error);

      if (mountedRef.current) {
        setSaveError("저장하지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }

  function handleCancelTitle() {
    if (isSaving) return;

    setPendingRoute(null);
    setSaveError(null);
    resetRecording();
  }

  async function handleOpenPlaceSheet() {
    if (
      (status !== "recording" && status !== "paused") ||
      isSaving ||
      pendingRoute
    ) {
      return;
    }

    const token = ++placeTokenRef.current;
    setPlaceSheet({ status: "locating" });

    try {
      const result = await requestLocation();

      if (token !== placeTokenRef.current || !mountedRef.current) {
        return;
      }

      if (result.ok) {
        setPlaceSheet({
          status: "ready",
          lat: result.lat,
          lng: result.lng,
          accuracy: result.accuracy,
        });
      } else {
        setPlaceSheet({
          status: "error",
          message: result.message,
        });
      }
    } catch {
      if (token === placeTokenRef.current && mountedRef.current) {
        setPlaceSheet({
          status: "error",
          message: "현재 위치를 가져오지 못했어요. 다시 시도해주세요.",
        });
      }
    }
  }

  function handleClosePlaceSheet() {
    placeTokenRef.current += 1;
    setPlaceSheet(null);
  }

  function handleAcceptDwell() {
    const prompt = dwellPromptRef.current;
    if (!prompt) return;

    placeTokenRef.current += 1;
    showDwellPrompt(null);
    setPlaceSheet({
      status: "ready",
      lng: prompt.center[0],
      lat: prompt.center[1],
      accuracy: null,
      dwell: {
        clusterId: prompt.clusterId,
        startedAt: prompt.startedAt,
        minutes: Math.max(
          prompt.minutes,
          Math.round((Date.now() - prompt.startedAt) / 60000),
        ),
      },
    });
  }

  // 기록 중 주기적으로 오래 머무는 곳이 있는지 확인
  const dwellBlocked = Boolean(placeSheet || pendingRoute);
  useEffect(() => {
    if (status !== "recording") return;

    const timer = setInterval(() => {
      if (dwellPromptRef.current || dwellBlocked) return;

      const detector = dwellDetectorRef.current;
      const now = Date.now();
      const cluster = detector?.due(now);
      if (!detector || !cluster) return;

      detector.markPrompted(cluster.id);

      const nearSaved = placesRef.current.some(
        (place) =>
          haversineMeters(cluster.center, [place.lng, place.lat]) <=
          NEAR_SAVED_PLACE_METERS,
      );
      if (nearSaved) return;

      dwellPromptRef.current = {
        clusterId: cluster.id,
        center: [...cluster.center],
        startedAt: cluster.startedAt,
        minutes: dwellMinutesOf(cluster, now),
      };
      setDwellPrompt(dwellPromptRef.current);
      postToNative({ type: "DWELL_DETECTED" });
    }, DWELL_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [status, dwellBlocked]);

  function handleSavePlace(
    name: string,
    category: PlaceCategory,
    providerId: string | null,
  ) {
    if (!placeSheet || placeSheet.status !== "ready") {
      return;
    }

    const dwell = placeSheet.dwell ?? null;

    const placeId = makePlaceKey({
      providerId,
      name,
      lat: placeSheet.lat,
      lng: placeSheet.lng,
    });

    const draft: PlaceDraft = {
      name,
      category,
      lat: placeSheet.lat,
      lng: placeSheet.lng,
      accuracyMeters: placeSheet.accuracy,
      savedAt: new Date().toISOString(),
      source: dwell ? "auto_prompt" : "manual",
      dwellMinutes: dwell ? dwell.minutes : null,
      placeId,
      regionDong: null,
    };

    if (dwell) {
      dwellSavedRef.current.set(dwell.clusterId, draft.savedAt);
    }

    placesRef.current = [...placesRef.current, draft];

    setPlaces(placesRef.current);
    setPlaceSheet(null);

    showToast("장소를 저장했어요.");
  }

  async function handleLogout() {
    setDrawerOpen(false);

    const { error } = await supabase.auth.signOut();

    if (error) {
      showToast("로그아웃에 실패했어요. 다시 시도해주세요.");
      return;
    }

    router.replace("/login");
  }

  function handleGoLogin() {
    setDrawerOpen(false);
    router.push("/login");
  }

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleTabChange(next: MainTab) {
    if (next === tab) return;

    clearCloseTimer();

    // 이전 탭의 비동기 위치 요청을 무효화합니다.
    cameraRequestRef.current += 1;
    tabRef.current = next;

    setSelectedRoute(null);
    setViewerOpen(false);
    setAnalysisOpen(false);
    if (next === "routes") handleClosePeer();
    setTab(next);

    // 탭 변경은 기록 시작/중지와 별개입니다.
  }

  // 기록 탭 진입 시 MapView 카메라 API로 현재 위치로 이동합니다.
  async function focusCurrentLocation(options: {
    reducedMotion: boolean;
  }): Promise<void> {
    const token = ++cameraRequestRef.current;

    try {
      if (
        !mountedRef.current ||
        token !== cameraRequestRef.current ||
        tabRef.current !== "record"
      ) {
        return;
      }

      await mapViewRef.current?.focusCurrentLocation(options);
    } catch {
      if (
        mountedRef.current &&
        token === cameraRequestRef.current &&
        tabRef.current === "record"
      ) {
        showToast("현재 위치를 가져오지 못했어요. 위치 권한을 확인해주세요.");
      }
    }
  }

  function handleSelectRoute(route: SavedRoute) {
    clearCloseTimer();

    setAnalysisOpen(false);
    setSelectedRoute(route);
    setViewerOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (mountedRef.current && tabRef.current === "routes") {
          setViewerOpen(true);
        }
      });
    });
  }

  function handleOpenAnalysis() {
    clearCloseTimer();

    setSelectedRoute(null);
    setViewerOpen(false);
    setAnalysisOpen(true);
  }

  function handleBack() {
    if (analysisOpen) {
      setAnalysisOpen(false);
      return;
    }

    setViewerOpen(false);
    clearCloseTimer();

    closeTimerRef.current = setTimeout(() => {
      setSelectedRoute(null);
      closeTimerRef.current = null;
    }, VIEWER_ANIM_MS);
  }

  const isBack =
    tab === "routes" &&
    (analysisOpen || (selectedRoute !== null && viewerOpen));

  const topTitle = analysisOpen
    ? "나의 취향"
    : selectedRoute
      ? selectedRoute.title
      : "My Routes";

  const rightAction =
    tab === "routes" && !analysisOpen && !selectedRoute
      ? {
          label: "취향 읽기",
          onClick: handleOpenAnalysis,
        }
      : null;

  const liveDistance = useMemo(() => calcTotalDistance(coords), [coords]);

  const canSavePlace =
    (status === "recording" || status === "paused") &&
    !isSaving &&
    pendingRoute === null;

  // [부트 연동] 세션 확인 전에도 부트 스크린이 같은 위치에 유지되도록 단일 return 구조
  const authed = !sessionLoading && guestChecked && owner !== null;

  return (
    <>
      {authed && owner ? (
        <>
          <MapTabLayout
            tab={tab}
            onTabChange={handleTabChange}
            map={
              <MapView
                ref={mapViewRef}
                coords={coords}
                places={places}
                initialCenter={INITIAL_CENTER}
                active={tab !== "routes"}
                recording={status === "recording"}
                onViewportChange={setViewport}
                onFollowingChange={setIsFollowing}
                onDevMove={handleDevMove}
                onReady={() => setMapReady(true)} // [부트 연동]
                peers={tab === "routes" ? [] : peerMarkers}
                selectedPeerId={selectedPeerId}
                onPeerSelect={handleSelectPeer}
                onLocation={handleSelfLocation}
              />
            }
            mapControls={
              <button
                type="button"
                onClick={() => mapViewRef.current?.recenter()}
                aria-label="현재 위치로 이동"
                title="현재 위치로 이동"
                aria-pressed={isFollowing}
                className={`san-icon-btn transition-opacity duration-500 ${
                  isFollowing ? "opacity-100" : "opacity-70"
                }`}
              >
                <LocationIcon />
              </button>
            }
            topBar={
              <TopBar
                title={tab === "record" ? "Record" : "Map"}
                isBack={false}
                onMenu={() => setDrawerOpen(true)}
                onBack={handleBack}
              />
            }
            overview={<RegionOverview summary={regionSummary} />}
            recordHud={
              <RecordHud
                status={status}
                distanceMeters={liveDistance}
                startedAt={startedAt}
                placeCount={places.length}
              />
            }
            recordingControls={
              <TrackingControls
                status={isSaving ? "paused" : status}
                onStart={handleStart}
                onPause={handlePause}
                onStop={handleStop}
                showSavePlace={canSavePlace}
                placeCount={places.length}
                onSavePlace={handleOpenPlaceSheet}
              />
            }
            routes={
              tab === "routes" ? (
                <section className="san-route-view">
                  <TopBar
                    title={topTitle}
                    isBack={isBack}
                    onMenu={() => setDrawerOpen(true)}
                    onBack={handleBack}
                    rightAction={rightAction}
                    viewToggle={
                      rightAction
                        ? { mode: routeView, onToggle: handleToggleRouteView }
                        : null
                    }
                  />

                  <div className="san-route-content">
                    <AnimatePresence mode="wait" initial={false}>
                      {analysisOpen ? (
                        <motion.div
                          key="analysis"
                          className="h-full"
                          {...screenMotion(reduceMotion)}
                        >
                          {session ? (
                            <AnalysisReport accessToken={session.access_token} />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center px-7 pb-28 text-center">
                              <p className="m-0 text-[14px] text-san-text">
                                로그인하면 취향 분석을 볼 수 있어요.
                              </p>
                              <button
                                type="button"
                                className="san-pill san-pill-fill mt-6"
                                onClick={handleGoLogin}
                              >
                                로그인
                              </button>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="routes"
                          className="h-full"
                          {...screenMotion(reduceMotion)}
                        >
                          <RouteGrid
                            owner={owner}
                            onSelect={handleSelectRoute}
                            view={routeView}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {selectedRoute && !analysisOpen && (
                      <RouteViewer
                        key={selectedRoute.id}
                        route={selectedRoute}
                        open={viewerOpen}
                      />
                    )}
                  </div>
                </section>
              ) : null
            }
            onFocusCurrentLocation={focusCurrentLocation}
          />

          <SideDrawer
            open={drawerOpen}
            email={session?.user.email ?? null}
            guest={isGuest}
            onClose={() => setDrawerOpen(false)}
            onLogout={handleLogout}
            onLogin={handleGoLogin}
            signal={{
              on: signalOn,
              status: signal.status,
              callSign: signal.callSign,
              nearby: signal.peers.length,
              onToggle: handleToggleSignal,
            }}
            ownerId={ownerId}
          />

          <AnimatePresence>
            {selectedPeer && tab !== "routes" && (
              <EmoteSheet
                key={`peer-${selectedPeer.sid}`}
                peer={selectedPeer}
                relation={signal.relations[selectedPeer.sid]}
                onEmote={handleEmote}
                onClose={handleClosePeer}
              />
            )}
          </AnimatePresence>

          {tab !== "routes" && !dwellPrompt && (
            <SignalNoticeBanner
              notice={signal.notices[0] ?? null}
              onReply={handleSelectPeer}
              onDismiss={signal.dismissNotice}
            />
          )}

          <AnimatePresence>
            {dwellPrompt && tab === "record" && !placeSheet && (
              <DwellPrompt
                key="dwell"
                minutes={dwellPrompt.minutes}
                onAccept={handleAcceptDwell}
                onDismiss={() => showDwellPrompt(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {toast && (
              <motion.div
                key="toast"
                {...toastMotion(reduceMotion)}
                role="status"
                className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-5"
                style={{
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + 184px)",
                }}
              >
                <span className="san-toast">{toast}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {placeSheet && (
              <PlaceSaveSheet
                key="place-sheet"
                state={placeSheet}
                onRetry={handleOpenPlaceSheet}
                onSave={handleSavePlace}
                onCancel={handleClosePlaceSheet}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {pendingRoute && (
              <RouteTitleModal
                key="route-title"
                defaultTitle={new Date(pendingRoute.startedAt).toLocaleString("ko-KR")}
                description={
                  pendingRoute.places.length > 0
                    ? `장소 ${pendingRoute.places.length}곳이 함께 저장돼요.`
                    : undefined
                }
                isSaving={isSaving}
                errorMessage={saveError}
                onConfirm={handleConfirmTitle}
                onCancel={handleCancelTitle}
              />
            )}
          </AnimatePresence>
        </>
      ) : (
        <main
          className="fixed inset-0 bg-san-bg"
          aria-label="로딩 중"
          aria-busy="true"
        />
      )}

      {/* [부트 연동] 파티클 인트로: 아래에서 지도가 미리 로드됨 */}
      {bootMode && (
        <BootIntroScreen
          mode={bootMode}
          mapReady={mapReady}
          getAvatarRect={() => mapViewRef.current?.getAvatarScreenRect() ?? null}
          onComplete={handleBootComplete}
        />
      )}
    </>
  );
}
