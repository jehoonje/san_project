// web/src/components/MapView.tsx
"use client";

import { useEffect, useRef } from "react";
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

    // 드래그(팬)와 회전 비활성화. 스크롤/핀치 줌은 기본값 유지 -> 확대·축소는 계속 가능
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

      // 현재 위치를 나타내는 마커 (좌표가 1개만 있어도 항상 표시됨)
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

    // 현재 위치 마커는 좌표 개수와 무관하게 항상 최신 위치로 이동
    markerRef.current?.setLngLat(latest);

    // 경로선은 좌표가 2개 이상 쌓였을 때부터 의미가 생김 (추적 중)
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });

    // 최초 실좌표 수신 시 즉시 이동(jumpTo), 이후엔 부드럽게 이동(easeTo)
    if (!hasRealLocationRef.current) {
      map.jumpTo({ center: latest, zoom: 17 });
      hasRealLocationRef.current = true;
    } else {
      map.easeTo({ center: latest, duration: 500 });
    }
  }, [coords]);

  // 추적 종료 등으로 좌표가 초기화되면 다음 위치 수신 시 다시 jumpTo 하도록 리셋
  useEffect(() => {
    if (coords.length === 0) {
      hasRealLocationRef.current = false;
    }
  }, [coords.length]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}