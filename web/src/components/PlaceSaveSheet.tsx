// web/src/components/PlaceSaveSheet.tsx
"use client";

import { useState } from "react";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/types/place";
import {
  useNearbyPlaces,
  type NearbyPlaceCandidate,
} from "@/hooks/useNearbyPlaces";

export type PlaceSheetState =
  | { status: "locating" }
  | { status: "ready"; lat: number; lng: number; accuracy: number | null }
  | { status: "error"; message: string };

type PlaceSaveSheetProps = {
  state: PlaceSheetState;
  onRetry: () => void;
  onSave: (
    name: string,
    category: PlaceCategory,
    providerId: string | null,
  ) => void;
  onCancel: () => void;
};

function emojiOf(category: PlaceCategory) {
  return (
    PLACE_CATEGORIES.find((c) => c.key === category)?.emoji ?? "📍"
  );
}

export function PlaceSaveSheet({
  state,
  onRetry,
  onSave,
  onCancel,
}: PlaceSaveSheetProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nearby = useNearbyPlaces(
    state.status === "ready" ? state.lat : null,
    state.status === "ready" ? state.lng : null,
  );

  const trimmed = name.trim();
  const canSave =
    state.status === "ready" && trimmed.length > 0 && category !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || category === null) return;
    onSave(trimmed, category, selectedId);
  }

  function handlePickCandidate(place: NearbyPlaceCandidate) {
    setName(place.name.slice(0, 60));
    setCategory(place.category);
    setSelectedId(place.providerId);
  }

  function handleNameChange(value: string) {
    setName(value);
    setSelectedId(null);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-5 pt-20">
      <style>{`
        @keyframes sheetIn {
          from { transform: translateY(-16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <form
        onSubmit={handleSubmit}
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl bg-white p-5 shadow-xl"
        style={{ animation: "sheetIn 0.25s ease-out both" }}
      >
        <h2 className="text-base font-semibold text-neutral-900">장소 저장</h2>

        <div className="mt-2 min-h-5 text-sm">
          {state.status === "locating" && (
            <p className="flex items-center gap-2 text-neutral-500">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-[#ff5a36]" />
              현재 위치를 확인하는 중...
            </p>
          )}
          {state.status === "ready" && (
            <p
              className={
                state.accuracy !== null && state.accuracy > 50
                  ? "text-amber-600"
                  : "text-green-600"
              }
            >
              위치 확인 완료
              {state.accuracy !== null
                ? ` (정확도 약 ${Math.round(state.accuracy)}m)`
                : ""}
              {state.accuracy !== null && state.accuracy > 50
                ? " · 정확도가 낮아요"
                : ""}
            </p>
          )}
          {state.status === "error" && (
            <p className="flex items-center justify-between gap-2 text-red-500">
              <span>{state.message}</span>
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700 active:scale-95 transition"
              >
                다시 시도
              </button>
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.status === "ready" && nearby.status === "loading" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-[#ff5a36]" />
              주변 장소를 찾는 중... 바로 입력해도 돼요
            </p>
          )}

          {nearby.status === "done" && nearby.places.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-neutral-500">
                주변 장소 (200m 이내)
              </p>
              <ul className="max-h-48 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200">
                {nearby.places.map((place) => {
                  const selected = selectedId === place.providerId;
                  return (
                    <li key={place.providerId}>
                      <button
                        type="button"
                        onClick={() => handlePickCandidate(place)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:bg-neutral-100 ${
                          selected ? "bg-[#fff1ed]" : "bg-white"
                        }`}
                      >
                        <span className="text-lg leading-none">
                          {emojiOf(place.category)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-medium ${
                              selected
                                ? "text-[#ff5a36]"
                                : "text-neutral-900"
                            }`}
                          >
                            {place.name}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            {place.categoryName.split(" > ").slice(-1)[0]}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-neutral-400">
                          {place.distanceMeters}m
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {nearby.status === "done" && nearby.places.length === 0 && (
            <p className="mt-3 text-xs text-neutral-400">
              200m 안에 추천할 장소가 없어요. 직접 입력해 주세요.
            </p>
          )}

          {nearby.status === "error" && (
            <p className="mt-3 text-xs text-neutral-400">
              주변 장소를 불러오지 못했어요. 직접 입력해 주세요.
            </p>
          )}

          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            maxLength={60}
            placeholder="장소 이름"
            className="mt-3 w-full rounded-xl border border-neutral-200 px-4 py-3 text-[16px] text-neutral-900 outline-none focus:border-[#ff5a36]"
          />

          <div className="mt-3 grid grid-cols-4 gap-2">
            {PLACE_CATEGORIES.map((c) => {
              const selected = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-medium transition active:scale-95 ${
                    selected
                      ? "border-[#ff5a36] bg-[#fff1ed] text-[#ff5a36]"
                      : "border-neutral-200 bg-white text-neutral-600"
                  }`}
                >
                  <span className="text-lg leading-none">{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-700 active:scale-95 transition"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 rounded-xl bg-[#ff5a36] py-3 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}