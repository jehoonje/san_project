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

  // handleStop이 실행되는 시점에 항상 "최신" coords를 참조하도록 ref로 동기화.
  // state(coords)는 클로저에 캡처되므로, STOP 처리 직전에 도착한 마지막
  // LOCATION_UPDATE가 리렌더에 반영되기 전이라면 handleStop 내부의 coords가
  // 실제보다 적은 값(심지어 빈 배열)일 수 있음. -> 저장 누락의 가장 흔한 원인.
  const coordsRef = useRef<[number, number][]>([]);

  const handleNativeMessage = useCallback((data: AppToWebMessage) => {
    if (data.type === "LOCATION_UPDATE") {
      console.log("[WEB] LOCATION_UPDATE 수신, 좌표 개수:", data.coords.length);
      coordsRef.current = data.coords;
      setCoords(data.coords);
    }
    if (data.type === "STATUS_ACK") {
      console.log("[WEB] STATUS_ACK 수신:", data.status);
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
    // state가 아닌 ref에서 "그 순간 최신값"을 읽는다.
    const finalCoords = coordsRef.current;
    const startedAt = startedAtRef.current;
    const endedAt = new Date().toISOString();

    console.log("[WEB] handleStop 시작", {
      finalCoordsLength: finalCoords.length,
      stateCoordsLength: coords.length,
      startedAt,
    });

    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");

    // 좌표가 2개 미만이면 의미있는 경로가 아니므로 저장하지 않음
    if (finalCoords.length < 2 || !startedAt) {
      console.warn("[WEB] 저장 스킵됨. 원인:", {
        coordsTooShort: finalCoords.length < 2,
        noStartedAt: !startedAt,
        finalCoordsLength: finalCoords.length,
      });
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

      console.log("[WEB] Supabase insert 시도:", {
        distanceMeters,
        durationSeconds,
        points: finalCoords.length,
      });

      const { data, error } = await supabase
        .from("routes")
        .insert({
          user_id: null, // 회원가입 기능 추가 전까지는 null로 저장
          title: `${new Date(startedAt).toLocaleString("ko-KR")} 산책`,
          coordinates: finalCoords,
          distance_meters: distanceMeters,
          duration_seconds: durationSeconds,
          started_at: startedAt,
          ended_at: endedAt,
        })
        .select();

      if (error) {
        // 진단이 끝나기 전까지는 alert로 즉시 원인을 노출한다.
        console.error("[WEB] 루트 저장 실패:", error);
        alert(
          `저장 실패\ncode: ${error.code}\nmessage: ${error.message}\ndetails: ${error.details ?? "-"}\nhint: ${error.hint ?? "-"}`
        );
      } else {
        console.log("[WEB] 루트 저장 완료:", {
          distanceMeters,
          durationSeconds,
          points: finalCoords.length,
          insertedRow: data,
        });
      }
    } catch (err) {
      console.error("[WEB] 루트 저장 중 예외 발생:", err);
      alert(`저장 중 예외 발생: ${String(err)}`);
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