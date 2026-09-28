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
    });

    map.on("error", (e) => {
      console.error("MAP ERROR:", e.error);
    });

    mapRef.current = map;
    return () => map.remove();
  }, [initialCenter]);

  // 좌표가 갱신될 때마다 경로선/카메라 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(ROUTE_SOURCE_ID)) return;

    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });

    const latest = coords[coords.length - 1];
    if (!latest) return;

    if (!hasRealLocationRef.current) {
      map.jumpTo({ center: latest, zoom: 17 });
      hasRealLocationRef.current = true;
    } else {
      map.easeTo({ center: latest, duration: 500 });
    }
  }, [coords]);

  // 추적 초기화(idle로 복귀) 시 다음 좌표에서 다시 jumpTo 하도록 리셋
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