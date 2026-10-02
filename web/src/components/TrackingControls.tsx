// web/src/components/TrackingControls.tsx
"use client";

import type { TrackingStatus } from "@/types/tracking";

type TrackingControlsProps = {
  status: TrackingStatus;
  lastMessage: string;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  showSavePlace: boolean;
  placeCount: number;
  onSavePlace: () => void;
};

export function TrackingControls({
  status,
  lastMessage,
  onStart,
  onPause,
  onStop,
  showSavePlace,
  placeCount,
  onSavePlace,
}: TrackingControlsProps) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          top: 20,
          zIndex: 10,
          borderRadius: 16,
          background: "rgba(255,255,255,0.95)",
          padding: 16,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "#000" }}>
          나만의 루트
        </h1>
        <p style={{ marginTop: 4, fontSize: 14, color: "#666" }}>
          상태: {status} · 최근 메시지: {lastMessage}
        </p>
      </div>

      {showSavePlace && (
        <button
          onClick={onSavePlace}
          style={{
            position: "absolute",
            left: 16,
            bottom: 92,
            zIndex: 10,
            padding: "12px 16px",
            borderRadius: 999,
            border: "none",
            background: "#fff",
            color: "#111",
            fontWeight: 600,
            fontSize: 14,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {"\u{1F4CD}"} 장소 저장{placeCount > 0 ? ` (${placeCount})` : ""}
        </button>
      )}

      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 32,
          zIndex: 10,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          onClick={onStart}
          style={{
            flex: 1,
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background: "#ff5a36",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          시작
        </button>
        <button
          onClick={onPause}
          style={{
            flex: 1,
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background: "#333",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          일시정지
        </button>
        <button
          onClick={onStop}
          style={{
            flex: 1,
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background: "#888",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          종료
        </button>
      </div>
    </>
  );
}