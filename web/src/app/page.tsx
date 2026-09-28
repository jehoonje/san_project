"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type TrackingStatus = "idle" | "recording" | "paused";

type AppToWebMessage =
  | { type: "LOCATION_UPDATE"; coords: [number, number][] }
  | { type: "STATUS_ACK"; status: TrackingStatus };

const sampleRoute: [number, number][] = [
  [126.978, 37.5665],
  [126.9786, 37.5667],
  [126.9791, 37.5672],
  [126.9798, 37.5676],
  [126.9805, 37.568],
];

function isReactNativeWebView() {
  return (
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ReactNativeWebView !== undefined
  );
}

function sendToApp(message: Record<string, unknown>) {
  if (isReactNativeWebView()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ReactNativeWebView.postMessage(JSON.stringify(message));
  } else {
    console.log("[WEB→APP] (브라우저 단독 실행 중, 앱 없음)", message);
  }
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hasRealLocationRef = useRef(false);
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [lastMessage, setLastMessage] = useState<string>("아직 메시지 없음");

  useEffect(() => {
    if (!mapContainer.current) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: sampleRoute[0],
      zoom: 15,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.resize();

      map.addSource("sample-route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: sampleRoute,
          },
        },
      });

      map.addLayer({
        id: "sample-route-line",
        type: "line",
        source: "sample-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ff5a36",
          "line-width": 6,
        },
      });

      new maplibregl.Marker({ color: "#ff5a36" })
        .setLngLat(sampleRoute[0])
        .addTo(map);
    });

    map.on("error", (e) => {
      console.error("MAP ERROR:", e.error);
    });

    return () => map.remove();
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data: AppToWebMessage = JSON.parse(event.data);
        setLastMessage(JSON.stringify(data));

        if (data.type === "LOCATION_UPDATE") {
          const map = mapRef.current;
          if (!map || !map.getSource("sample-route")) return;

          const source = map.getSource(
            "sample-route"
          ) as maplibregl.GeoJSONSource;

          source.setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: data.coords,
            },
          });

          const latest = data.coords[data.coords.length - 1];
          if (latest) {
            if (!hasRealLocationRef.current) {
              map.jumpTo({ center: latest, zoom: 17 });
              hasRealLocationRef.current = true;
            } else {
              map.easeTo({ center: latest, duration: 500 });
            }
          }
        }

        if (data.type === "STATUS_ACK") {
          setStatus(data.status);
          if (data.status === "idle") {
            hasRealLocationRef.current = false;
          }
        }
      } catch (err) {
        console.error("메시지 파싱 실패:", err, event.data);
      }
    }

    document.addEventListener("message", handleMessage as EventListener);
    window.addEventListener("message", handleMessage);

    return () => {
      document.removeEventListener("message", handleMessage as EventListener);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

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
      <div
        ref={mapContainer}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
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
          onClick={handleStart}
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
          onClick={handlePause}
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
          onClick={handleStop}
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
    </main>
  );
}