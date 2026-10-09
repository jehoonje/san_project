"use client";

import "./map-home.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MapTabLayout, type MainTab } from "@/components/MapTabLayout";
import { AnalysisReport } from "@/components/AnalysisReport";
import { MapView, type MapViewport } from "@/components/MapView";
import { TrackingControls } from "@/components/TrackingControls";
import { TopBar } from "@/components/TopBar";
import { SideDrawer } from "@/components/SideDrawer";
import { RegionOverview } from "@/components/RegionOverview";
import { RouteGrid } from "@/components/RouteGrid";
import { RouteViewer } from "@/components/RouteViewer";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import {
  PlaceSaveSheet,
  type PlaceSheetState,
} from "@/components/PlaceSaveSheet";

import { useRegionSummary } from "@/hooks/useRegionSummary";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useSession } from "@/hooks/useSession";

import { makePlaceKey } from "@/lib/placeKey";
import { supabase } from "@/lib/supabaseClient";
import { postToNative } from "@/lib/nativeBridge";

import type { AppToWebMessage, TrackingStatus } from "@/types/tracking";
import type { SavedRoute } from "@/types/route";
import type { PlaceCategory, PlaceDraft } from "@/types/place";

const INITIAL_CENTER: [number, number] = [126.978, 37.5665];
const VIEWER_ANIM_MS = 300;

type PendingRoute = {
  coords: [number, number][];
  places: PlaceDraft[];
  startedAt: string;
  endedAt: string;
};

function haversineMeters(a: [number, number], b: [number, number]) {
  const radius = 6371000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const toRad = (degree: number) => (degree * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

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

  const [status, setStatus] = useState<TrackingStatus>("idle");
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
  const tabRef = useRef<MainTab>("map");
  const mountedRef = useRef(true);

  const coordsRef = useRef<[number, number][]>([]);
  const placesRef = useRef<PlaceDraft[]>([]);

  const handleNativeMessage = useCallback((data: AppToWebMessage) => {
    if (data.type === "LOCATION_UPDATE") {
      coordsRef.current = data.coords;
      setCoords(data.coords);
    }

    if (data.type === "STATUS_ACK") {
      setStatus(data.status);
    }
  }, []);

  const { sendToApp } = useNativeBridge(handleNativeMessage);
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

    setCoords([]);
    setPlaces([]);
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

  function handleStart() {
    if (isSaving || pendingRoute) return;

    const isResume = status === "paused" && startedAtRef.current !== null;

    if (!isResume) {
      startedAtRef.current = new Date().toISOString();

      coordsRef.current = [];
      placesRef.current = [];

      setCoords([]);
      setPlaces([]);
    }

    sendToApp({ type: "START_TRACKING" });
    setStatus("recording");
  }

  function handlePause() {
    if (isSaving || pendingRoute) return;

    sendToApp({ type: "PAUSE_TRACKING" });
    setStatus("paused");
  }

  function handleStop() {
    if (isSaving || pendingRoute) return;

    const finalCoords = [...coordsRef.current];
    const finalPlaces = [...placesRef.current];
    const startedAt = startedAtRef.current;
    const endedAt = new Date().toISOString();

    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");

    // 진행 중인 장소 위치 요청도 무효화합니다.
    placeTokenRef.current += 1;
    setPlaceSheet(null);

    if (finalCoords.length < 2 || !startedAt) {
      resetRecording();
      showToast("저장할 이동 기록이 부족해요.");
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
    if (!pendingRoute || !userId || isSaving) return;

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

      const { error } = await supabase.rpc("save_route_with_places", {
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
      });

      if (!mountedRef.current) return;

      if (error) {
        console.error("루트 저장 실패:", error);
        setSaveError("저장에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      setPendingRoute(null);
      resetRecording();
      setSummaryRevision((current) => current + 1);

      showToast("루트를 저장했어요.");
    } catch (error) {
      console.error("루트 저장 중 예외 발생:", error);

      if (mountedRef.current) {
        setSaveError("저장 중 오류가 발생했습니다.");
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

  function handleSavePlace(
    name: string,
    category: PlaceCategory,
    providerId: string | null,
  ) {
    if (!placeSheet || placeSheet.status !== "ready") {
      return;
    }

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
      source: "manual",
      dwellMinutes: null,
      placeId,
      regionDong: null,
    };

    placesRef.current = [...placesRef.current, draft];

    setPlaces(placesRef.current);
    setPlaceSheet(null);

    showToast(`장소를 저장했어요 (${placesRef.current.length}개)`);
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
    setTab(next);

    // 탭 변경은 기록 시작/중지와 별개입니다.
  }

  /**
   * 현재 MapView에는 카메라 제어 prop/ref가 없으므로
   * 위치만 요청하고 카메라 연결 미완료 상태를 안내합니다.
   *
   * MapView 카메라 API를 추가한 뒤 아래 showToast 부분을
   * 실제 지도 이동 호출로 교체해야 합니다.
   *
   * initialCenter나 viewport 상태를 변경하는 것만으로
   * 실제 지도 카메라를 이동했다고 처리하지 않습니다.
   */
  async function focusCurrentLocation(_options: {
    reducedMotion: boolean;
  }): Promise<void> {
    const token = ++cameraRequestRef.current;

    try {
      const result = await requestLocation();

      if (
        !mountedRef.current ||
        token !== cameraRequestRef.current ||
        tabRef.current !== "record"
      ) {
        return;
      }

      if (!result.ok) {
        showToast(result.message);
        return;
      }

      showToast("위치는 확인했어요. 지도 카메라 이동 연결이 아직 필요해요.");
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
    ? "My Analysis"
    : selectedRoute
      ? selectedRoute.title
      : "My Route";

  const rightAction =
    tab === "routes" && !analysisOpen && !selectedRoute
      ? {
          label: "장소 분석 리포트",
          onClick: handleOpenAnalysis,
        }
      : null;

  const canSavePlace =
    (status === "recording" || status === "paused") &&
    !isSaving &&
    pendingRoute === null;

  if (sessionLoading || !session) {
    return (
      <main
        className="fixed inset-0 bg-black"
        aria-label="로딩 중"
        aria-busy="true"
      />
    );
  }

  return (
    <>
      <MapTabLayout
        tab={tab}
        onTabChange={handleTabChange}
        map={
          <MapView
            coords={coords}
            places={places}
            initialCenter={INITIAL_CENTER}
            active={tab !== "routes"}
            onViewportChange={setViewport}
          />
        }
        topBar={
          <TopBar
            title={tab === "record" ? "기록" : "지도"}
            isBack={false}
            onMenu={() => setDrawerOpen(true)}
            onBack={handleBack}
          />
        }
        overview={<RegionOverview summary={regionSummary} />}
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
              />

              <div className="san-route-content">
                {!analysisOpen && <RouteGrid onSelect={handleSelectRoute} />}

                {analysisOpen && (
                  <AnalysisReport accessToken={session.access_token} />
                )}

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
        email={session.user.email ?? null}
        onClose={() => setDrawerOpen(false)}
        onLogout={handleLogout}
      />

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-5"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 176px)",
          }}
        >
          <span className="max-w-md rounded-2xl border border-white/10 bg-neutral-950/95 px-4 py-3 text-center text-sm leading-relaxed text-white shadow-xl backdrop-blur-xl">
            {toast}
          </span>
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
          defaultTitle={`${new Date(pendingRoute.startedAt).toLocaleString(
            "ko-KR",
          )} 산책`}
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
    </>
  );
}
