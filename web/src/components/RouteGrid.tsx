"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import type { SavedRoute } from "@/types/route";

type RouteGridProps = {
  onSelect: (route: SavedRoute) => void;
};

const LONG_PRESS_MS = 2000;
const MOVE_TOLERANCE_PX = 10;

function PencilIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function RouteGlyph() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 24c-2.2 0-4-1.8-4-4s1.8-4 4-4h18c2.2 0 4-1.8 4-4s-1.8-4-4-4H11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="7" cy="24" r="2.5" fill="currentColor" />
      <circle cx="11" cy="8" r="2.5" fill="currentColor" />
    </svg>
  );
}

function formatDistance(meters: number | null) {
  if (meters == null) return "거리 없음";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function RouteGrid({ onSelect }: RouteGridProps) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<SavedRoute | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedRoute | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error: loadError } = await supabase
        .from("routes")
        .select(
          `
          id, title, coordinates, distance_meters, duration_seconds,
          started_at, ended_at, created_at,
          route_places (
            id, name, category, lat, lng, accuracy_meters,
            dwell_minutes, source, saved_at, created_at, place_id, region_dong
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (loadError) {
        console.error("루트 목록 조회 실패:", loadError);
        setError("루트를 불러오지 못했습니다.");
      } else {
        setRoutes((data ?? []) as unknown as SavedRoute[]);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function clearPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startPosRef.current = null;
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (editing) return;
    longPressedRef.current = false;
    startPosRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      timerRef.current = null;
      setEditing(true);
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event: React.PointerEvent) {
    const start = startPosRef.current;
    if (!start || !timerRef.current) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
      MOVE_TOLERANCE_PX
    )
      clearPress();
  }

  function handleCardClick(route: SavedRoute) {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (!editing) onSelect(route);
  }

  async function handleEditConfirm(title: string) {
    if (!editTarget) return;
    if (title === editTarget.title) {
      setEditTarget(null);
      return;
    }

    setIsBusy(true);
    setActionError(null);
    const { data, error: updateError } = await supabase
      .from("routes")
      .update({ title })
      .eq("id", editTarget.id)
      .select("id");
    setIsBusy(false);

    if (updateError || !data?.length) {
      console.error("루트 수정 실패:", updateError);
      setActionError("수정에 실패했습니다. 권한 설정을 확인해 주세요.");
      return;
    }

    setRoutes((previous) =>
      previous.map((route) =>
        route.id === editTarget.id ? { ...route, title } : route,
      ),
    );
    setEditTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsBusy(true);
    setActionError(null);
    const { data, error: deleteError } = await supabase
      .from("routes")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    setIsBusy(false);

    if (deleteError || !data?.length) {
      console.error("루트 삭제 실패:", deleteError);
      setActionError("삭제에 실패했습니다. 권한 설정을 확인해 주세요.");
      return;
    }

    const remaining = routes.filter((route) => route.id !== deleteTarget.id);
    setRoutes(remaining);
    setDeleteTarget(null);
    if (!remaining.length) setEditing(false);
  }

  function closeModals() {
    if (isBusy) return;
    setEditTarget(null);
    setDeleteTarget(null);
    setActionError(null);
  }

  if (loading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3"
        aria-label="루트 불러오는 중"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="aspect-[1.05] animate-pulse rounded-[24px] border border-white/[0.06] bg-white/[0.04]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#ff8b78]">
        {error}
      </div>
    );
  }

  if (!routes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="text-neutral-600">
          <RouteGlyph />
        </span>
        <p className="mt-5 text-base font-semibold text-neutral-200">
          아직 저장한 루트가 없어요
        </p>
        <p className="mt-2 max-w-[28ch] text-sm leading-6 text-neutral-500">
          기록 탭에서 이동을 시작하면 여기에 나만의 루트가 쌓입니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto overscroll-contain"
      onClick={(event) => {
        if (editing && event.target === event.currentTarget) setEditing(false);
      }}
    >
      <style>{`
        @keyframes routeJiggle { from { transform: rotate(-.7deg); } to { transform: rotate(.7deg); } }
        @keyframes routeBadgePop { 0% { transform: scale(0); opacity: 0; } 65% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .route-jiggle { animation: none !important; } }
      `}</style>

      {editing && (
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#050b14]/80 px-4 py-3 backdrop-blur-2xl">
          <span className="text-xs font-medium text-neutral-400">
            수정하거나 삭제할 루트를 선택하세요
          </span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-11 rounded-full border border-white/10 bg-white/[0.07] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.11] active:scale-95"
          >
            완료
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 content-start gap-3 p-4 sm:grid-cols-3 md:gap-4 md:p-6">
        {routes.map((route, index) => (
          <article
            key={route.id}
            className={`relative ${editing ? "route-jiggle" : ""}`}
            style={
              editing
                ? {
                    animation: `routeJiggle .3s ease-in-out -${(index % 5) * 0.05}s infinite alternate`,
                  }
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => handleCardClick(route)}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onPointerCancel={clearPress}
              onContextMenu={(event) => event.preventDefault()}
              className="group flex aspect-[1.05] w-full select-none flex-col justify-between overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#0e1722]/90 bg-[radial-gradient(circle_at_100%_0%,rgba(0,191,255,.12),transparent_55%)] p-4 text-left shadow-[0_16px_40px_rgba(0,0,0,.18)] backdrop-blur-xl transition duration-200 [-webkit-touch-callout:none] hover:border-[#00bfff]/30 active:scale-[0.98]"
              aria-label={`${route.title} 루트 열기`}
            >
              <span className="text-[#00bfff]/85 transition group-hover:text-[#33ccff]">
                <RouteGlyph />
              </span>
              <span className="block min-w-0">
                <span className="line-clamp-2 block break-words text-sm font-semibold leading-5 text-neutral-100">
                  {route.title}
                </span>
                <span className="mt-2 flex items-center gap-2 text-xs tabular-nums text-neutral-500">
                  <span>{formatDistance(route.distance_meters)}</span>
                  <span
                    className="h-0.5 w-0.5 rounded-full bg-neutral-600"
                    aria-hidden="true"
                  />
                  <span>
                    {formatDate(route.started_at ?? route.created_at)}
                  </span>
                </span>
              </span>
            </button>

            {editing && (
              <div className="absolute -right-1.5 -top-1.5 flex gap-1.5">
                <button
                  type="button"
                  aria-label={`${route.title} 이름 수정`}
                  onClick={() => {
                    setActionError(null);
                    setEditTarget(route);
                  }}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-[#0a2233]/95 text-white shadow-xl backdrop-blur-xl transition active:scale-90"
                  style={{
                    animation:
                      "routeBadgePop .3s cubic-bezier(.34,1.56,.64,1) both",
                  }}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  aria-label={`${route.title} 삭제`}
                  onClick={() => {
                    setActionError(null);
                    setDeleteTarget(route);
                  }}
                  className="grid h-11 w-11 place-items-center rounded-full border border-[#ff715c]/25 bg-[#4a1c18]/95 text-[#ff9c8d] shadow-xl backdrop-blur-xl transition active:scale-90"
                  style={{
                    animation:
                      "routeBadgePop .3s cubic-bezier(.34,1.56,.64,1) .05s both",
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {editTarget && (
              <RouteTitleModal
                defaultTitle={editTarget.title}
                heading="루트 이름 수정"
                description="새로운 루트 이름을 입력해 주세요."
                confirmLabel="수정"
                isSaving={isBusy}
                errorMessage={actionError}
                onConfirm={handleEditConfirm}
                onCancel={closeModals}
              />
            )}
            {deleteTarget && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-5 backdrop-blur-md"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closeModals();
                }}
              >
                <section
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="delete-route-title"
                  className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,23,34,.96),rgba(5,11,20,.98))] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl"
                >
                  <div
                    className="mb-5 h-px w-10 bg-[#00bfff]/70"
                    aria-hidden="true"
                  />
                  <h2
                    id="delete-route-title"
                    className="text-lg font-semibold tracking-[-0.02em]"
                  >
                    루트를 삭제할까요?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    <span className="font-medium text-neutral-200">
                      {deleteTarget.title}
                    </span>{" "}
                    기록은 삭제 후 복구할 수 없습니다.
                  </p>
                  {actionError && (
                    <p role="alert" className="mt-3 text-sm text-[#ff8b78]">
                      {actionError}
                    </p>
                  )}
                  <div className="mt-6 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={closeModals}
                      disabled={isBusy}
                      className="min-h-12 rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold text-neutral-300 transition active:scale-[0.98] disabled:opacity-40"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteConfirm}
                      disabled={isBusy}
                      className="min-h-12 rounded-full bg-[#ff715c] text-sm font-semibold text-[#180806] transition hover:bg-[#ff856f] active:scale-[0.98] disabled:opacity-40"
                    >
                      {isBusy ? "삭제 중…" : "삭제"}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </>,
          document.body,
        )}
    </div>
  );
}