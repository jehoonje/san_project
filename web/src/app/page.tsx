// web/src/app/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { MapView } from "@/components/MapView";
import { TrackingControls } from "@/components/TrackingControls";
import { TopBar } from "@/components/TopBar";
import { SideDrawer } from "@/components/SideDrawer";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { RouteGrid } from "@/components/RouteGrid";
import { RouteViewer } from "@/components/RouteViewer";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import { DwellPrompt } from "@/components/DwellPrompt";
import {
  PlaceSaveSheet,
  type PlaceSheetState,
} from "@/components/PlaceSaveSheet";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useSimulatedWalk } from "@/hooks/useSimulatedWalk";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabaseClient";
import {
  getNativeRedirectUri,
  postToNative,
} from "@/lib/nativeBridge";
import { haversineMeters, type LngLat } from "@/lib/geo";
import {
  DWELL_RADIUS_METERS,
  DWELL_THRESHOLD_MS,
  DwellDetector,
  dwellMinutesOf,
  type DwellCluster,
} from "@/lib/dwell";
import type {
  AppToWebMessage,
  TrackingStatus,
} from "@/types/tracking";
import type { SavedRoute } from "@/types/route";
import type {
  PlaceCategory,
  PlaceDraft,
} from "@/types/place";

const INITIAL_CENTER: [number, number] = [126.978, 37.5665];
const VIEWER_ANIM_MS = 300;

// 데스크탑 확인용 시뮬레이션(?sim=1)에서는 15초만 머물러도 제안
const SIM_DWELL_THRESHOLD_MS = 15 * 1000;
const DWELL_CHECK_INTERVAL_MS = 5000;
// 이미 저장한 장소 근처라면 다시 묻지 않음
const NEAR_SAVED_PLACE_METERS = 50;

type DwellPromptState = {
  clusterId: number;
  center: LngLat;
  startedAt: number;
  minutes: number;
};

function subscribeNoop() {
  return () => {};
}

function readSimMode() {
  return (
    getNativeRedirectUri() === null &&
    new URLSearchParams(window.location.search).get("sim") === "1"
  );
}

type PendingRoute = {
  coords: [number, number][];
  places: PlaceDraft[];
  startedAt: string;
  endedAt: string;
};

function calcTotalDistance(coords: [number, number][]) {
  let total = 0;

  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
  }

  return Math.round(total);
}

export default function Home() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id ?? null;

  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [places, setPlaces] = useState<PlaceDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRoute, setPendingRoute] =
    useState<PendingRoute | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [placeSheet, setPlaceSheet] =
    useState<PlaceSheetState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("record");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] =
    useState<SavedRoute | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const startedAtRef = useRef<string | null>(null);
  const closeTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeTokenRef = useRef(0);

  const coordsRef = useRef<[number, number][]>([]);
  const placesRef = useRef<PlaceDraft[]>([]);

  const isSimMode = useSyncExternalStore(
    subscribeNoop,
    readSimMode,
    () => false,
  );

  const [dwellPrompt, setDwellPrompt] =
    useState<DwellPromptState | null>(null);
  const dwellPromptRef = useRef<DwellPromptState | null>(null);
  const dwellDetectorRef = useRef<DwellDetector | null>(null);
  // 체류 구간 id → 그 구간에서 저장한 장소의 savedAt
  const dwellSavedRef = useRef(new Map<number, string>());
  const statusRef = useRef<TrackingStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  function getDwellDetector() {
    if (!dwellDetectorRef.current) {
      dwellDetectorRef.current = new DwellDetector(
        DWELL_RADIUS_METERS,
        readSimMode() ? SIM_DWELL_THRESHOLD_MS : DWELL_THRESHOLD_MS,
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
        ? {
            ...place,
            dwellMinutes: Math.max(place.dwellMinutes ?? 0, minutes),
          }
        : place,
    );
    setPlaces(placesRef.current);
  }

  function applyLocationUpdate(nextCoords: [number, number][]) {
    coordsRef.current = nextCoords;
    setCoords(nextCoords);

    const last = nextCoords[nextCoords.length - 1];
    if (statusRef.current !== "recording" || !last) return;

    finishDwell(getDwellDetector().observe(last, Date.now()));
  }

  const applyLocationUpdateRef = useRef(applyLocationUpdate);
  useEffect(() => {
    applyLocationUpdateRef.current = applyLocationUpdate;
  });

  const handleNativeMessage = useCallback(
    (data: AppToWebMessage) => {
      if (data.type === "LOCATION_UPDATE") {
        applyLocationUpdateRef.current(data.coords);
      }

      if (data.type === "STATUS_ACK") {
        statusRef.current = data.status;
        setStatus(data.status);
      }
    },
    [],
  );

  const handleSimulatedPoint = useCallback((point: LngLat) => {
    applyLocationUpdateRef.current([...coordsRef.current, point]);
  }, []);

  useSimulatedWalk(
    isSimMode,
    status,
    INITIAL_CENTER,
    handleSimulatedPoint,
  );

  const { sendToApp, lastMessage } =
    useNativeBridge(handleNativeMessage);
  const { requestLocation } = usePlaceLocation();

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.replace("/login");
    }
  }, [sessionLoading, session, router]);

  useEffect(() => {
    if (userId) {
      postToNative({ type: "WEB_READY" });
    }
  }, [userId]);

  function resetRecording() {
    dwellDetectorRef.current?.reset();
    dwellSavedRef.current.clear();
    showDwellPrompt(null);
    setCoords([]);
    coordsRef.current = [];
    setPlaces([]);
    placesRef.current = [];
    startedAtRef.current = null;
  }

  function showToast(message: string) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2000);
  }

  function handleStart() {
    const isResume =
      status === "paused" && startedAtRef.current !== null;

    if (!isResume) {
      startedAtRef.current = new Date().toISOString();
      coordsRef.current = [];
      setCoords([]);
      placesRef.current = [];
      setPlaces([]);
      dwellSavedRef.current.clear();
    }

    // 일시정지했던 시간은 체류로 치지 않도록 새로 시작
    dwellDetectorRef.current?.reset();
    statusRef.current = "recording";
    sendToApp({ type: "START_TRACKING" });
    setStatus("recording");
  }

  function handlePause() {
    finishDwell(getDwellDetector().reset());
    showDwellPrompt(null);
    statusRef.current = "paused";
    sendToApp({ type: "PAUSE_TRACKING" });
    setStatus("paused");
  }

  function handleStop() {
    finishDwell(getDwellDetector().reset());
    showDwellPrompt(null);
    statusRef.current = "idle";

    const finalCoords = [...coordsRef.current];
    const finalPlaces = [...placesRef.current];
    const startedAt = startedAtRef.current;
    const endedAt = new Date().toISOString();

    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");

    if (finalCoords.length < 2 || !startedAt) {
      resetRecording();
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
    if (!pendingRoute || !userId) return;

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
      const durationSeconds = Math.round(
        (new Date(endedAt).getTime() -
          new Date(startedAt).getTime()) /
          1000,
      );

      const enrichedPlaces = await Promise.all(
        finalPlaces.map(async (place) => {
          try {
            const res = await fetch(
              `/api/region-dong?lat=${place.lat}&lng=${place.lng}`,
            );
            const json = res.ok ? await res.json() : null;
            return { ...place, regionDong: json?.regionDong ?? null };
          } catch {
            return place;
          }
        }),
      );
      

      const { error } = await supabase.rpc(
        "save_route_with_places",
        {
          p_title: title,
          p_coordinates: finalCoords,
          p_distance_meters: distanceMeters,
          p_duration_seconds: durationSeconds,
          p_started_at: startedAt,
          p_ended_at: endedAt,
          p_places: enrichedPlaces.map((place) => ({
            name: place.name,
            category: place.category,
            lat: place.lat,
            lng: place.lng,
            accuracy_meters: place.accuracyMeters,
            dwell_minutes: place.dwellMinutes,
            source: place.source,
            saved_at: place.savedAt,
            place_id: place.placeId,
            region_dong: place.regionDong,
          })),
        },
      );

      if (error) {
        console.error("루트 저장 실패:", error);
        setSaveError(
          "저장에 실패했습니다. 다시 시도해 주세요.",
        );
        return;
      }

      console.log("루트 저장 완료:", {
        title,
        distanceMeters,
        durationSeconds,
        points: finalCoords.length,
        places: finalPlaces.length,
      });

      setPendingRoute(null);
      resetRecording();
    } catch (error) {
      console.error("루트 저장 중 예외 발생:", error);
      setSaveError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancelTitle() {
    if (isSaving) return;

    setPendingRoute(null);
    setSaveError(null);
    resetRecording();
  }

  async function handleOpenPlaceSheet() {
    const token = ++placeTokenRef.current;
    setPlaceSheet({ status: "locating" });

    const result = await requestLocation();
    if (token !== placeTokenRef.current) return;

    setPlaceSheet(
      result.ok
        ? {
            status: "ready",
            lat: result.lat,
            lng: result.lng,
            accuracy: result.accuracy,
          }
        : {
            status: "error",
            message: result.message,
          },
    );
  }

  function handleAcceptDwell() {
    const prompt = dwellPromptRef.current;
    if (!prompt) return;

    placeTokenRef.current++;
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

  function handleDismissDwell() {
    // 이미 이 구간은 물어본 것으로 표시됨. 자리를 떠났다가 다시 머물면 다시 제안
    showDwellPrompt(null);
  }

  // 기록 중 주기적으로 오래 머무는 곳이 있는지 확인
  useEffect(() => {
    if (status !== "recording") return;

    const timer = setInterval(() => {
      if (
        dwellPromptRef.current ||
        placeSheet ||
        pendingRoute
      ) {
        return;
      }

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

      showDwellPrompt({
        clusterId: cluster.id,
        center: [...cluster.center],
        startedAt: cluster.startedAt,
        minutes: dwellMinutesOf(cluster, now),
      });
      postToNative({ type: "DWELL_DETECTED" });
    }, DWELL_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [status, placeSheet, pendingRoute]);

  function handleClosePlaceSheet() {
    placeTokenRef.current++;
    setPlaceSheet(null);
  }

  function handleSavePlace(
    name: string,
    category: PlaceCategory,
    providerId: string | null,
  ) {
    if (!placeSheet || placeSheet.status !== "ready") return;

    const dwell = placeSheet.dwell ?? null;
    const draft: PlaceDraft = {
      name,
      category,
      lat: placeSheet.lat,
      lng: placeSheet.lng,
      accuracyMeters: placeSheet.accuracy,
      savedAt: new Date().toISOString(),
      source: dwell ? "auto_prompt" : "manual",
      dwellMinutes: dwell ? dwell.minutes : null,
      placeId: providerId,
      regionDong: null,
    };

    if (dwell) {
      dwellSavedRef.current.set(dwell.clusterId, draft.savedAt);
    }

    placesRef.current = [...placesRef.current, draft];
    setPlaces(placesRef.current);
    setPlaceSheet(null);
    showToast(
      `장소를 저장했어요 (${placesRef.current.length}개)`,
    );
  }

  async function handleLogout() {
    setDrawerOpen(false);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleTabChange(next: Tab) {
    if (next === tab) return;

    clearCloseTimer();
    setSelectedRoute(null);
    setViewerOpen(false);
    setTab(next);
  }

  function handleSelectRoute(route: SavedRoute) {
    clearCloseTimer();
    setSelectedRoute(route);
    setViewerOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => setViewerOpen(true));
    });
  }

  function handleBack() {
    setViewerOpen(false);
    clearCloseTimer();

    closeTimerRef.current = setTimeout(() => {
      setSelectedRoute(null);
      closeTimerRef.current = null;
    }, VIEWER_ANIM_MS);
  }

  const isBack =
    tab === "myroute" &&
    selectedRoute !== null &&
    viewerOpen;

  const topTitle =
    tab === "record"
      ? "Record"
      : selectedRoute
        ? selectedRoute.title
        : "My Route";

  const canSavePlace =
    (status === "recording" || status === "paused") &&
    !isSaving &&
    pendingRoute === null;

  if (sessionLoading || !session) {
    return <main className="fixed inset-0 bg-white" />;
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-white">
      <TopBar
        title={topTitle}
        isBack={isBack}
        onMenu={() => setDrawerOpen(true)}
        onBack={handleBack}
      />

      <div className="relative flex-1 overflow-hidden">
        <div
          className={`absolute inset-0 isolate ${
            tab === "record"
              ? ""
              : "invisible pointer-events-none"
          }`}
        >
          <MapView
            coords={coords}
            places={places}
            initialCenter={INITIAL_CENTER}
          />

          <TrackingControls
            status={isSaving ? "paused" : status}
            lastMessage={
              isSaving ? "루트 저장 중..." : lastMessage
            }
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
            showSavePlace={canSavePlace}
            placeCount={places.length}
            onSavePlace={handleOpenPlaceSheet}
          />
        </div>

        {tab === "myroute" && (
          <div className="absolute inset-0 z-30 bg-white">
            <RouteGrid onSelect={handleSelectRoute} />

            {selectedRoute && (
              <RouteViewer
                key={selectedRoute.id}
                route={selectedRoute}
                open={viewerOpen}
              />
            )}
          </div>
        )}
      </div>

      <BottomNav tab={tab} onChange={handleTabChange} />

      <SideDrawer
        open={drawerOpen}
        email={session.user.email ?? null}
        onClose={() => setDrawerOpen(false)}
        onLogout={handleLogout}
      />

      {isSimMode && tab === "record" && (
        <div className="pointer-events-none fixed bottom-[150px] right-4 z-[45] rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-neutral-900 shadow">
          시뮬레이션 모드 · 15초 머물면 제안
        </div>
      )}

      {dwellPrompt && tab === "record" && !placeSheet && (
        <DwellPrompt
          minutes={dwellPrompt.minutes}
          onAccept={handleAcceptDwell}
          onDismiss={handleDismissDwell}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[55] flex justify-center">
          <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {placeSheet && (
        <PlaceSaveSheet
          state={placeSheet}
          onRetry={handleOpenPlaceSheet}
          onSave={handleSavePlace}
          onCancel={handleClosePlaceSheet}
        />
      )}

      {pendingRoute && (
        <RouteTitleModal
          defaultTitle={`${new Date(
            pendingRoute.startedAt,
          ).toLocaleString("ko-KR")} 산책`}
          description={
            pendingRoute.places.length > 0
              ? `장소 ${pendingRoute.places.length}개가 함께 저장됩니다. 루트의 이름을 입력해 주세요.`
              : undefined
          }
          isSaving={isSaving}
          errorMessage={saveError}
          onConfirm={handleConfirmTitle}
          onCancel={handleCancelTitle}
        />
      )}
    </main>
  );
}