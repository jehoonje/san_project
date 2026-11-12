"use client";

import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import type { MapViewport } from "@/components/MapView";

export type RegionSummary = {
  displayName: string;
  localName: string;
  temperature: number | null;
  totalRoutes: number | null;
  myRoutes: number | null;
  regionLoading: boolean;
  countsLoading: boolean;
  regionError: string | null;
  countsError: string | null;
};

type RegionResponse = {
  displayName?: string;
  localName?: string;
  temperature?: number | null;
  error?: string;
};

function normalizeLongitude(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function parseCount(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

export function useRegionSummary(
  viewport: MapViewport,
  userId: string | null,
  revision = 0,
): RegionSummary {
  const [region, setRegion] = useState({
    displayName: "현재 지역",
    localName: "",
    temperature: null as number | null,
    regionLoading: true,
    regionError: null as string | null,
  });

  const [counts, setCounts] = useState({
    totalRoutes: null as number | null,
    myRoutes: null as number | null,
    countsLoading: true,
    countsError: null as string | null,
  });

  const regionRequestRef = useRef(0);
  const countsRequestRef = useRef(0);

  // 약 0.001도 단위로 요청 좌표를 묶어
  // 미세한 카메라 이동으로 인한 불필요한 조회를 줄입니다.
  const lng = Number(
    normalizeLongitude(viewport.center[0]).toFixed(3),
  );
  const lat = Number(
    Math.max(-90, Math.min(90, viewport.center[1])).toFixed(3),
  );

  const rawWest = viewport.bounds.west;
  const rawEast = viewport.bounds.east;
  const coversWorld = Math.abs(rawEast - rawWest) >= 360;

  const west = coversWorld
    ? -180
    : normalizeLongitude(rawWest);

  const east = coversWorld
    ? 180
    : normalizeLongitude(rawEast);

  const south = Math.max(-90, viewport.bounds.south);
  const north = Math.min(90, viewport.bounds.north);

  useEffect(() => {
    const requestId = ++regionRequestRef.current;
    const controller = new AbortController();
    let disposed = false;

    setRegion({
      displayName: "현재 지역",
      localName: "",
      temperature: null,
      regionLoading: true,
      regionError: null,
    });

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            lat: String(lat),
            lng: String(lng),
          });

          const response = await fetch(
            `/api/region-summary?${params}`,
            { signal: controller.signal },
          );

          const json =
            (await response.json()) as RegionResponse;

          if (!response.ok) {
            throw new Error(
              json.error ?? "지역 정보를 불러오지 못했어요.",
            );
          }

          if (
            disposed ||
            requestId !== regionRequestRef.current
          ) {
            return;
          }

          const localName =
            typeof json.localName === "string"
              ? json.localName.trim()
              : "";

          const displayName =
            typeof json.displayName === "string"
              ? json.displayName.trim()
              : "";

          const hasRegion =
            displayName.length > 0 &&
            displayName !== "현재 지역";

          setRegion({
            displayName: displayName || "현재 지역",
            localName,
            temperature:
              typeof json.temperature === "number" &&
              Number.isFinite(json.temperature)
                ? Math.round(json.temperature)
                : null,
            regionLoading: false,
            regionError: hasRegion
              ? null
              : "지역명을 확인하지 못했어요.",
          });
        } catch (error) {
          if (
            disposed ||
            controller.signal.aborted ||
            requestId !== regionRequestRef.current
          ) {
            return;
          }

          setRegion({
            displayName: "현재 지역",
            localName: "",
            temperature: null,
            regionLoading: false,
            regionError:
              error instanceof Error
                ? error.message
                : "지역 정보를 불러오지 못했어요.",
          });
        }
      })();
    }, 800);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lat, lng]);

  useEffect(() => {
    const requestId = ++countsRequestRef.current;
    let disposed = false;

    if (!userId) {
      setCounts({
        totalRoutes: null,
        myRoutes: null,
        countsLoading: false,
        countsError: null,
      });

      return;
    }

    setCounts({
      totalRoutes: null,
      myRoutes: null,
      countsLoading: true,
      countsError: null,
    });

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc(
            "map_route_counts",
            {
              p_west: west,
              p_south: south,
              p_east: east,
              p_north: north,
            },
          );

          if (error) throw error;

          if (
            disposed ||
            requestId !== countsRequestRef.current
          ) {
            return;
          }

          const row = Array.isArray(data) ? data[0] : data;
          const totalRoutes = parseCount(row?.total_routes);
          const myRoutes = parseCount(row?.my_routes);

          if (totalRoutes === null || myRoutes === null) {
            throw new Error("통계 응답 형식이 올바르지 않아요.");
          }

          setCounts({
            totalRoutes,
            myRoutes,
            countsLoading: false,
            countsError: null,
          });
        } catch (error) {
          if (
            disposed ||
            requestId !== countsRequestRef.current
          ) {
            return;
          }

          console.error("[MAP-COUNTS]", error);

          setCounts({
            totalRoutes: null,
            myRoutes: null,
            countsLoading: false,
            countsError:
              "루트 통계를 불러오지 못했어요. RPC 적용 여부와 로그인 상태를 확인해주세요.",
          });
        }
      })();
    }, 350);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [west, south, east, north, userId, revision]);

  return { ...region, ...counts };
}