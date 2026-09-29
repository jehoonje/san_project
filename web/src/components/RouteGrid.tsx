// web/src/components/RouteGrid.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { SavedRoute } from "@/types/route";

type RouteGridProps = {
  onSelect: (route: SavedRoute) => void;
};

// 길게 누르기 판정 시간 (ms). 체감이 너무 길면 이 값만 줄이면 됨
const LONG_PRESS_MS = 2000;
// 이 거리(px) 이상 손가락이 움직이면 길게 누르기 취소 (스크롤 의도로 판단)
const MOVE_TOLERANCE_PX = 10;

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
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
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, title, coordinates, distance_meters, duration_seconds, started_at, ended_at, created_at",
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function clearPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (editing) return;
    longPressedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      timerRef.current = null;
      setEditing(true);
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = startPosRef.current;
    if (!start || !timerRef.current) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > MOVE_TOLERANCE_PX) clearPress();
  }

  function handleCardClick(route: SavedRoute) {
    // 길게 누르기로 편집 모드에 진입한 직후의 손가락 뗌은 클릭으로 처리하지 않음
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (editing) return;
    onSelect(route);
  }

  function handleBackgroundClick(e: React.MouseEvent) {
    if (editing && e.target === e.currentTarget) setEditing(false);
  }

  async function handleEditConfirm(title: string) {
    if (!editTarget) return;
    if (title === editTarget.title) {
      setEditTarget(null);
      return;
    }

    setIsBusy(true);
    setActionError(null);

    const { data, error } = await supabase
      .from("routes")
      .update({ title })
      .eq("id", editTarget.id)
      .select("id");

    setIsBusy(false);

    if (error || !data || data.length === 0) {
      console.error("루트 수정 실패:", error);
      setActionError("수정에 실패했습니다. 권한(RLS) 설정을 확인해 주세요.");
      return;
    }

    setRoutes((prev) =>
      prev.map((r) => (r.id === editTarget.id ? { ...r, title } : r)),
    );
    setEditTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    setIsBusy(true);
    setActionError(null);

    const { data, error } = await supabase
      .from("routes")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");

    setIsBusy(false);

    if (error || !data || data.length === 0) {
      console.error("루트 삭제 실패:", error);
      setActionError("삭제에 실패했습니다. 권한(RLS) 설정을 확인해 주세요.");
      return;
    }

    const remaining = routes.filter((r) => r.id !== deleteTarget.id);
    setRoutes(remaining);
    setDeleteTarget(null);
    if (remaining.length === 0) setEditing(false);
  }

  function closeModals() {
    if (isBusy) return;
    setEditTarget(null);
    setDeleteTarget(null);
    setActionError(null);
  }

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
    <div className="h-full overflow-y-auto" onClick={handleBackgroundClick}>
      <style>{`
        @keyframes jiggle {
          from { transform: rotate(-1.4deg); }
          to { transform: rotate(1.4deg); }
        }
        @keyframes badgePop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {editing && (
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white/90 px-4 py-2 backdrop-blur">
          <span className="text-xs text-neutral-500">루트 편집</span>
          <button
            onClick={() => setEditing(false)}
            className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white active:scale-95 transition"
          >
            완료
          </button>
        </div>
      )}

      <div
        className="grid grid-cols-3 content-start gap-3 p-4"
        onClick={handleBackgroundClick}
      >
        {routes.map((route, index) => (
          <div
            key={route.id}
            className="relative"
            style={
              editing
                ? {
                    animation: `jiggle 0.28s ease-in-out ${-(index % 5) * 0.06}s infinite alternate`,
                  }
                : undefined
            }
          >
            <button
              onClick={() => handleCardClick(route)}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onPointerCancel={clearPress}
              onContextMenu={(e) => e.preventDefault()}
              className="flex aspect-square w-full select-none items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-2 text-center shadow-sm transition duration-200 [-webkit-touch-callout:none] active:scale-95 active:bg-neutral-100"
            >
              <span className="line-clamp-3 break-words text-sm font-medium text-neutral-800">
                {route.title}
              </span>
            </button>

            {editing && (
              <div className="absolute -right-2 -top-2 flex gap-1">
                <button
                  aria-label="루트 이름 수정"
                  onClick={() => {
                    setActionError(null);
                    setEditTarget(route);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md active:scale-90"
                  style={{
                    animation:
                      "badgePop 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
                  }}
                >
                  <PencilIcon />
                </button>
                <button
                  aria-label="루트 삭제"
                  onClick={() => {
                    setActionError(null);
                    setDeleteTarget(route);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-md active:scale-90"
                  style={{
                    animation:
                      "badgePop 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.07s both",
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 상단바/하단바(z-40)보다 위에 표시하기 위해 body로 포털 */}
      {typeof document !== "undefined" &&
        createPortal(
          <>
            {editTarget && (
              <RouteTitleModal
                defaultTitle={editTarget.title}
                heading="루트 이름 수정"
                description="새 이름을 입력해 주세요."
                confirmLabel="수정"
                isSaving={isBusy}
                errorMessage={actionError}
                onConfirm={handleEditConfirm}
                onCancel={closeModals}
              />
            )}
            {deleteTarget && (
              <ConfirmDialog
                title="루트 삭제"
                message={`"${deleteTarget.title}" 루트를 삭제할까요? 삭제하면 되돌릴 수 없습니다.`}
                isBusy={isBusy}
                errorMessage={actionError}
                onConfirm={handleDeleteConfirm}
                onCancel={closeModals}
              />
            )}
          </>,
          document.body,
        )}
    </div>
  );
}
