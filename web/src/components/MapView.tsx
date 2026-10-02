// web/src/components/MapView.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  addPlaceLayer,
  updatePlaceLayer,
} from "@/lib/placeMap";
import type { PlaceMapItem } from "@/types/place";

type MapViewProps = {
  coords: [number, number][];
  places: PlaceMapItem[];
  initialCenter: [number, number];
};

const ROUTE_SOURCE_ID = "live-route";
const ROUTE_LAYER_ID = "live-route-line";
const PLACE_PREFIX = "live";

export function MapView({
  coords,
  places,
  initialCenter,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hasRealLocationRef = useRef(false);
  const latestCoordRef = useRef<[number, number] | null>(null);
  const latestCoordsRef = useRef<[number, number][]>(coords);
  const latestPlacesRef = useRef<PlaceMapItem[]>(places);
  const isFollowingRef = useRef(true);

  const [hasLocation, setHasLocation] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);

  // 경로선/마커/카메라 갱신 (지도 준비 후에만 호출)
  const applyCoords = useCallback(
    (map: maplibregl.Map, nextCoords: [number, number][]) => {
      const source = map.getSource(ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: nextCoords,
        },
      });

      const latest = nextCoords[nextCoords.length - 1];
      if (!latest) return;

      latestCoordRef.current = latest;
      markerRef.current?.setLngLat(latest);

      if (!hasRealLocationRef.current) {
        map.jumpTo({ center: latest, zoom: 17 });
        hasRealLocationRef.current = true;
        setHasLocation(true);
      } else if (isFollowingRef.current) {
        map.easeTo({ center: latest, duration: 500 });
      }
    },
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: initialCenter,
      zoom: 15,
    });

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable();

    const stopFollowing = () => {
      if (isFollowingRef.current) {
        isFollowingRef.current = false;
        setIsFollowing(false);
      }
    };

    map.on("dragstart", stopFollowing);
    map.on("zoomstart", (event) => {
      if (event.originalEvent) stopFollowing();
    });

    map.on("load", () => {
      map.resize();

      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [],
          },
        },
      });

      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ff5a36",
          "line-width": 6,
        },
      });

      // 경로선보다 나중에 추가해 장소 아이콘이 선 위에 표시되도록 함
      addPlaceLayer(map, PLACE_PREFIX, latestPlacesRef.current);

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

      // 지도가 준비되기 전에 도착한 좌표와 장소를 반영
      applyCoords(map, latestCoordsRef.current);
      updatePlaceLayer(map, PLACE_PREFIX, latestPlacesRef.current);
    });

    map.on("error", (event) => {
      console.error("MAP ERROR:", event.error);
    });

    mapRef.current = map;

    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [initialCenter, applyCoords]);

  // 좌표가 갱신될 때마다 최신값을 기억하고, 지도가 준비돼 있으면 바로 반영
  useEffect(() => {
    latestCoordsRef.current = coords;

    const map = mapRef.current;
    if (!map || !map.getSource(ROUTE_SOURCE_ID)) return;

    applyCoords(map, coords);
  }, [coords, applyCoords]);

  // 장소 입력 직후 최신 목록을 지도 GeoJSON source에 반영
  useEffect(() => {
    latestPlacesRef.current = places;

    const map = mapRef.current;
    if (!map) return;

    updatePlaceLayer(map, PLACE_PREFIX, places);
  }, [places]);

  function handleRecenter() {
    const map = mapRef.current;
    const latest = latestCoordRef.current;
    if (!map || !latest) return;

    isFollowingRef.current = true;
    setIsFollowing(true);
    map.easeTo({ center: latest, zoom: 17, duration: 500 });
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {!isFollowing && hasLocation && (
        <button
          onClick={handleRecenter}
          aria-label="현재 위치로 이동"
          style={{
            position: "absolute",
            right: 16,
            bottom: 120,
            zIndex: 15,
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "none",
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}
        >
          {"\u{1F4CD}"}
        </button>
      )}

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