// web/src/app/page.tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { TrackingControls } from "@/components/TrackingControls";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { supabase } from "@/lib/supabaseClient";
import type { AppToWebMessage, TrackingStatus } from "@/types/tracking";

const INITIAL_CENTER: [number, number] = [126.978, 37.5665];

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
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const startedAtRef = useRef<string | null>(null);

  // handleStop 실행 시점에 항상 최신 좌표를 참조하기 위한 ref.
  // state(coords)만 쓰면 STOP 직전 마지막 LOCATION_UPDATE가 리렌더에
  // 반영되기 전에 handleStop이 실행될 경우 좌표가 누락될 수 있음.
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

  // 종료 시: 좌표를 Supabase에 저장한 뒤 초기화
  async function handleStop() {
    const finalCoords = coordsRef.current;
    const startedAt = startedAtRef.current;
    const endedAt = new Date().toISOString();

    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");

    // 좌표가 2개 미만이면 의미있는 경로가 아니므로 저장하지 않음
    if (finalCoords.length < 2 || !startedAt) {
      setCoords([]);
      coordsRef.current = [];
      startedAtRef.current = null;
      return;
    }

    setIsSaving(true);
    try {
      const distanceMeters = calcTotalDistance(finalCoords);
      const durationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
      );

      const { error } = await supabase.from("routes").insert({
        user_id: null, // 회원가입 기능 추가 전까지는 null로 저장
        title: `${new Date(startedAt).toLocaleString("ko-KR")} 산책`,
        coordinates: finalCoords,
        distance_meters: distanceMeters,
        duration_seconds: durationSeconds,
        started_at: startedAt,
        ended_at: endedAt,
      });

      if (error) {
        console.error("루트 저장 실패:", error);
      } else {
        console.log("루트 저장 완료:", {
          distanceMeters,
          durationSeconds,
          points: finalCoords.length,
        });
      }
    } catch (err) {
      console.error("루트 저장 중 예외 발생:", err);
    } finally {
      setIsSaving(false);
      setCoords([]);
      coordsRef.current = [];
      startedAtRef.current = null;
    }
  }

  return (
    <main
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
      }}
    >
      <MapView coords={coords} initialCenter={INITIAL_CENTER} />
      <TrackingControls
        status={isSaving ? "paused" : status}
        lastMessage={isSaving ? "루트 저장 중..." : lastMessage}
        onStart={handleStart}
        onPause={handlePause}
        onStop={handleStop}
      />
    </main>
  );
}