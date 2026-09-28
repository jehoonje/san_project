// web/src/components/MapView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type MapViewProps = {
  coords: [number, number][];
  initialCenter: [number, number];
};

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";

export function MapView({ coords, initialCenter }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hasRealLocationRef = useRef(false);
  const [hasLocation, setHasLocation] = useState(false); // 실제 위치 도착 여부

  // 지도 최초 1회 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: initialCenter,
      zoom: 15,
    });

    map.dragPan.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable();

    map.on("load", () => {
      map.resize();

      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ff5a36", "line-width": 6 },
      });

      const el = document.createElement("div");
      el.style.width = "18px";
      el.style.height = "18px";
      el.style.borderRadius = "50%";
      el.style.background = "#2563eb";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 0 0 2px rgba(37,99,235,0.4)";

      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(initialCenter)
        .addTo(map);
    });

    map.on("error", (e) => {
      console.error("MAP ERROR:", e.error);
    });

    mapRef.current = map;
    return () => map.remove();
  }, [initialCenter]);

  // 좌표가 갱신될 때마다 마커/경로선/카메라 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(ROUTE_SOURCE_ID)) return;

    const latest = coords[coords.length - 1];
    if (!latest) return;

    markerRef.current?.setLngLat(latest);

    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });

    if (!hasRealLocationRef.current) {
      map.jumpTo({ center: latest, zoom: 17 });
      hasRealLocationRef.current = true;
      setHasLocation(true); // 실제 위치 도착 -> 로딩 오버레이 제거
    } else {
      map.easeTo({ center: latest, duration: 500 });
    }
  }, [coords]);

  useEffect(() => {
    if (coords.length === 0) {
      hasRealLocationRef.current = false;
      setHasLocation(false);
    }
  }, [coords.length]);

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {!hasLocation && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "#fff",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "4px solid #eee",
              borderTopColor: "#ff5a36",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ fontSize: 14, color: "#666" }}>
            현재 위치를 확인하는 중...
          </p>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}