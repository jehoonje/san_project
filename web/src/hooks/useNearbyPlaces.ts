// web/src/hooks/useNearbyPlaces.ts
"use client";

import { useEffect, useState } from "react";
import type { PlaceCategory } from "@/types/place";

export type NearbyPlaceCandidate = {
  providerId: string;
  name: string;
  category: PlaceCategory;
  categoryName: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  address: string;
};

type NearbyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; places: NearbyPlaceCandidate[] }
  | { status: "error" };

type NearbyResponse = {
  places?: NearbyPlaceCandidate[];
};

type FetchResult =
  | { key: string; ok: true; places: NearbyPlaceCandidate[] }
  | { key: string; ok: false };

export function useNearbyPlaces(
  lat: number | null,
  lng: number | null,
): NearbyState {
  const [result, setResult] = useState<FetchResult | null>(null);

  const key =
    lat === null || lng === null ? null : `${lat},${lng}`;

  useEffect(() => {
    if (lat === null || lng === null) return;

    const requestKey = `${lat},${lng}`;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/nearby-places?lat=${lat}&lng=${lng}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as NearbyResponse;

        setResult({
          key: requestKey,
          ok: true,
          places: data.places ?? [],
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("주변 장소 조회 실패:", error);
        setResult({ key: requestKey, ok: false });
      }
    }

    load();

    return () => controller.abort();
  }, [lat, lng]);

  if (key === null) return { status: "idle" };
  if (result === null || result.key !== key) {
    return { status: "loading" };
  }
  if (!result.ok) return { status: "error" };

  return { status: "done", places: result.places };
}