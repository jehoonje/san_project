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
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabaseClient";
import { postToNative } from "@/lib/nativeBridge";
import type { AppToWebMessage, TrackingStatus } from "@/types/tracking";
import type { SavedRoute } from "@/types/route";

const INITIAL_CENTER: [number, number] = [126.978, 37.5665];
const VIEWER_ANIM_MS = 300;

type PendingRoute = {
  coords: [number, number][];
  startedAt: string;
  endedAt: string;
};

// 두 좌표 사이 거리(m) 계산 - Haversine 공식
function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
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
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<PendingRoute | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("record");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const startedAtRef = useRef<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // handleStop 실행 시점에 항상 최신 좌표를 참조하기 위한 ref
  const coordsRef = useRef<[number, number][]>([]);

  const handleNativeMessage = useCallback((data: AppToWebMessage) => {
    if (data.type === "LOCATION_UPDATE") {
      coordsRef.current = data.coords;
      setCoords(data.coords);
    }
    if (data.type === "STATUS_ACK") {
      setStatus(data.status);
    }
  }, []);

  const { sendToApp, lastMessage } = useNativeBridge(handleNativeMessage);

  // 로그인 안 된 상태면 로그인 화면으로
  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  // 메인(지도) 화면이 열렸음을 앱에 알림 → 앱이 현재 위치를 다시 전달
  useEffect(() => {
    if (userId) postToNative({ type: "WEB_READY" });
  }, [userId]);

  function resetRecording() {
    setCoords([]);
    coordsRef.current = [];
    startedAtRef.current = null;
  }

  function handleStart() {
    startedAtRef.current = new Date().toISOString();
    coordsRef.current = [];
    setCoords([]);
    sendToApp({ type: "START_TRACKING" });
    setStatus("recording");
  }

  function handlePause() {
    sendToApp({ type: "PAUSE_TRACKING" });
    setStatus("paused");
  }

  // 종료 시: 저장할 만한 경로면 제목 입력 팝업을 띄움 (저장은 확인 후)
  function handleStop() {
    const finalCoords = [...coordsRef.current];
    const startedAt = startedAtRef.current;
    const endedAt = new Date().toISOString();

    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");

    // 좌표가 2개 미만이면 의미있는 경로가 아니므로 저장하지 않음
    if (finalCoords.length < 2 || !startedAt) {
      resetRecording();
      return;
    }

    setSaveError(null);
    setPendingRoute({ coords: finalCoords, startedAt, endedAt });
  }

  // 팝업 확인: 입력한 제목으로 Supabase에 저장
  async function handleConfirmTitle(title: string) {
    if (!pendingRoute || !userId) return;
    const { coords: finalCoords, startedAt, endedAt } = pendingRoute;

    setIsSaving(true);
    setSaveError(null);
    try {
      const distanceMeters = calcTotalDistance(finalCoords);
      const durationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
      );

      const { error } = await supabase.from("routes").insert({
        user_id: userId,
        title,
        coordinates: finalCoords,
        distance_meters: distanceMeters,
        duration_seconds: durationSeconds,
        started_at: startedAt,
        ended_at: endedAt,
      });

      if (error) {
        console.error("루트 저장 실패:", error);
        setSaveError("저장에 실패했습니다. 다시 시도해 주세요.");
        return; // 팝업 유지 → 재시도 가능
      }

      console.log("루트 저장 완료:", {
        title,
        distanceMeters,
        durationSeconds,
        points: finalCoords.length,
      });
      setPendingRoute(null);
      resetRecording();
    } catch (err) {
      console.error("루트 저장 중 예외 발생:", err);
      setSaveError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  // 팝업 취소: 저장하지 않고 기록 폐기
  function handleCancelTitle() {
    if (isSaving) return;
    setPendingRoute(null);
    setSaveError(null);
    resetRecording();
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
    // 마운트 직후 다음 프레임에 open → 페이드/스케일 인
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

  const isBack = tab === "myroute" && selectedRoute !== null && viewerOpen;

  const topTitle =
    tab === "record"
      ? "Record"
      : selectedRoute
        ? selectedRoute.title
        : "My Route";

  // 세션 확인 전/미로그인 상태에서는 지도를 마운트하지 않음
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
        {/* Record: 탭 전환 시에도 언마운트하지 않고 숨김 처리 (지도/추적 상태 유지) */}
        <div
          className={`absolute inset-0 isolate ${
            tab === "record" ? "" : "invisible pointer-events-none"
          }`}
        >
          <MapView coords={coords} initialCenter={INITIAL_CENTER} />
          <TrackingControls
            status={isSaving ? "paused" : status}
            lastMessage={isSaving ? "루트 저장 중..." : lastMessage}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
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

      {pendingRoute && (
        <RouteTitleModal
          defaultTitle={`${new Date(pendingRoute.startedAt).toLocaleString("ko-KR")} 산책`}
          isSaving={isSaving}
          errorMessage={saveError}
          onConfirm={handleConfirmTitle}
          onCancel={handleCancelTitle}
        />
      )}
    </main>
  );
}