// web/src/app/page.tsx
"use client";

import { useCallback, useState } from "react";
import { MapView } from "@/components/MapView";
import { TrackingControls } from "@/components/TrackingControls";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import type { AppToWebMessage, TrackingStatus } from "@/types/tracking";

const INITIAL_CENTER: [number, number] = [126.978, 37.5665];

export default function Home() {
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [coords, setCoords] = useState<[number, number][]>([]);

  const handleNativeMessage = useCallback((data: AppToWebMessage) => {
    if (data.type === "LOCATION_UPDATE") {
      setCoords(data.coords);
    }
    if (data.type === "STATUS_ACK") {
      setStatus(data.status);
      if (data.status === "idle") {
        setCoords([]); // 종료 시 경로 초기화
      }
    }
  }, []);

  const { sendToApp, lastMessage } = useNativeBridge(handleNativeMessage);

  function handleStart() {
    sendToApp({ type: "START_TRACKING" });
    setStatus("recording");
  }

  function handlePause() {
    sendToApp({ type: "PAUSE_TRACKING" });
    setStatus("paused");
  }

  function handleStop() {
    sendToApp({ type: "STOP_TRACKING" });
    setStatus("idle");
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
        status={status}
        lastMessage={lastMessage}
        onStart={handleStart}
        onPause={handlePause}
        onStop={handleStop}
      />
    </main>
  );
}