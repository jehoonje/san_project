// web/src/components/RouteGrid.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SavedRoute } from "@/types/route";

type RouteGridProps = {
  onSelect: (route: SavedRoute) => void;
};

export function RouteGrid({ onSelect }: RouteGridProps) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, title, coordinates, distance_meters, duration_seconds, started_at, ended_at, created_at"
        )
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("루트 목록 조회 실패:", error);
        setError("루트를 불러오지 못했습니다.");
      } else {
        setRoutes((data ?? []) as SavedRoute[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        저장된 루트가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-3 content-start gap-3 p-4">
        {routes.map((route) => (
          <button
            key={route.id}
            onClick={() => onSelect(route)}
            className="flex aspect-square items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-2 text-center shadow-sm transition duration-200 active:scale-95 active:bg-neutral-100"
          >
            <span className="line-clamp-3 break-words text-sm font-medium text-neutral-800">
              {route.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}