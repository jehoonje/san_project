// web/src/app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapView } from "@/components/MapView";
import { TrackingControls } from "@/components/TrackingControls";
import { TopBar } from "@/components/TopBar";
import { SideDrawer } from "@/components/SideDrawer";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { RouteGrid } from "@/components/RouteGrid";
import { RouteViewer } from "@/components/RouteViewer";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import {
  PlaceSaveSheet,
  type PlaceSheetState,
} from "@/components/PlaceSaveSheet";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { usePlaceLocation } from "@/hooks/usePlaceLocation";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabaseClient";
import { postToNative } from "@/lib/nativeBridge";
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

type PendingRoute = {
  coords: [number, number][];
  places: PlaceDraft[];
  startedAt: string;
  endedAt: string;
};

function haversineMeters(
  a: [number, number],
  b: [number, number],
) {
  const R = 6371000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

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

  const handleNativeMessage = useCallback(
    (data: AppToWebMessage) => {
      if (data.type === "LOCATION_UPDATE") {
        coordsRef.current = data.coords;
        setCoords(data.coords);
      }

      if (data.type === "STATUS_ACK") {
        setStatus(data.status);
      }
    },
    [],
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
    }

    sendToApp({ type: "START_TRACKING" });
    setStatus("recording");
  }

  function handlePause() {
    sendToApp({ type: "PAUSE_TRACKING" });
    setStatus("paused");
  }

  function handleStop() {
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
  
    const draft: PlaceDraft = {
      name,
      category,
      lat: placeSheet.lat,
      lng: placeSheet.lng,
      accuracyMeters: placeSheet.accuracy,
      savedAt: new Date().toISOString(),
      source: "manual",
      dwellMinutes: null,
      placeId: providerId,
      regionDong: null,
    };

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