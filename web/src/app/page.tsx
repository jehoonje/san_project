"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const sampleRoute: [number, number][] = [
  [126.9780, 37.5665],
  [126.9786, 37.5667],
  [126.9791, 37.5672],
  [126.9798, 37.5676],
  [126.9805, 37.5680],
];

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: sampleRoute[0],
      zoom: 15,
    });

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
          지도 표시 테스트 · 주황색 선은 샘플 경로
        </p>
      </div>
    </main>
  );
}