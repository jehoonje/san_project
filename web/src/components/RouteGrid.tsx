"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dialogMotion, screenMotion, scrimMotion } from "@/lib/motion";
import {
  deleteRoute,
  listRoutes,
  renameRoute,
  type RouteOwner,
} from "@/lib/routeStore";
import { RouteTitleModal } from "@/components/RouteTitleModal";
import { RouteLog } from "@/components/RouteLog";
import type { SavedRoute } from "@/types/route";

export type RouteViewMode = "grid" | "log";

type RouteGridProps = {
  owner: RouteOwner;
  onSelect: (route: SavedRoute) => void;
  view?: RouteViewMode;
};

const LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 10;

function PencilIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.5 19.5h7" />
      <path d="M16.2 4.3a1.9 1.9 0 0 1 2.7 2.7L8 17.9l-3.6.9.9-3.6Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7h15M9 7V5h6v2M18 7l-.8 11.2a1.6 1.6 0 0 1-1.6 1.5H8.4a1.6 1.6 0 0 1-1.6-1.5L6 7" />
    </svg>
  );
}

/** 경로의 실제 모양을 가는 잉크 선으로 축소해 그립니다. (시작 = 빈 점, 끝 = 채운 점) */
function RouteTrace({ coordinates }: { coordinates: [number, number][] }) {
  const coords = (coordinates ?? []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );

  if (coords.length < 2) {
    return (
      <svg viewBox="0 0 100 64" className="h-full w-full" aria-hidden="true">
        <ellipse
          cx="50"
          cy="32"
          rx="30"
          ry="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const midLat = coords[Math.floor(coords.length / 2)][1];
  const kx = Math.cos((midLat * Math.PI) / 180);
  const pts = coords.map(([lng, lat]) => {
    const x = lng * kx;
    const y = -lat;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    return [x, y] as const;
  });

  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const scale = Math.min(84 / w, 48 / h);
  const ox = (100 - w * scale) / 2;
  const oy = (64 - h * scale) / 2;
  // 점이 많아도 카드에서는 150개 안팎이면 충분
  const step = Math.max(1, Math.floor(pts.length / 150));
  const shown = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const place = ([x, y]: readonly [number, number]) =>
    [ox + (x - minX) * scale, oy + (y - minY) * scale] as const;
  const d = shown
    .map((pt, i) => {
      const [x, y] = place(pt);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const [sx, sy] = place(pts[0]);
  const [ex, ey] = place(pts[pts.length - 1]);

  return (
    <svg viewBox="0 0 100 64" className="h-full w-full" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={sx}
        cy={sy}
        r="1.9"
        fill="var(--san-surface)"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={ex} cy={ey} r="1.9" fill="currentColor" />
    </svg>
  );
}

function formatDistance(meters: number | null) {
  if (meters == null) return "–.– km";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--.--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--.--";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

type DeleteRouteModalProps = {
  title: string;
  isBusy: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

function DeleteRouteModal({
  title,
  isBusy,
  errorMessage,
  onConfirm,
  onCancel,
}: DeleteRouteModalProps) {
  const headingId = useId();
  const reducedMotion = useReducedMotion();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) onCancelRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isBusy]);

  return (
    <motion.div
      className="san-scrim-layer fixed inset-0 z-[60] flex items-center justify-center px-5"
      role="presentation"
      {...scrimMotion(reducedMotion)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.section
        {...dialogMotion(reducedMotion)}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-sm rounded-[28px] bg-san-bg p-6 text-san-text"
      >
        <p className="san-eyebrow">DELETE</p>
        <h2 id={headingId} className="san-title mt-2">
          이 걸음을 지울까요
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-san-text">
          <span className="font-medium">{title}</span> 기록은 지우면 되돌릴 수
          없어요.
        </p>
        {errorMessage && (
          <p role="alert" className="mt-3 text-[13px] text-san-error">
            {errorMessage}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="san-pill"
          >
            그대로 두기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="san-pill san-pill-danger"
          >
            {isBusy ? "지우는 중…" : "지우기"}
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

export function RouteGrid({ owner, onSelect, view = "grid" }: RouteGridProps) {
  const ownerKey = owner.kind === "user" ? owner.userId : "guest";
  const reducedMotion = useReducedMotion();
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
      try {
        const data = await listRoutes(owner);
        if (cancelled) return;
        setRoutes(data);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        console.error("루트 목록 조회 실패:", loadError);
        setError("걸음을 불러오지 못했어요.");
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // owner는 매 렌더 새 객체일 수 있어 식별 키로만 다시 불러옴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // 루트가 모두 사라지면 편집 모드 해제
  useEffect(() => {
    if (!loading && routes.length === 0) setEditing(false);
  }, [loading, routes.length]);

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

    const targetId = editTarget.id;
    setIsBusy(true);
    setActionError(null);
    try {
      const ok = await renameRoute(owner, targetId, title);
      if (!ok) {
        setActionError("이미 지워졌거나 고칠 수 없는 걸음이에요.");
        return;
      }
    } catch (updateError) {
      console.error("루트 수정 실패:", updateError);
      setActionError("고치지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      return;
    } finally {
      setIsBusy(false);
    }

    setRoutes((previous) =>
      previous.map((route) =>
        route.id === targetId ? { ...route, title } : route,
      ),
    );
    setEditTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    const targetId = deleteTarget.id;
    setIsBusy(true);
    setActionError(null);
    try {
      const ok = await deleteRoute(owner, targetId);
      if (!ok) {
        setActionError("이미 지워졌거나 지울 수 없는 걸음이에요.");
        return;
      }
    } catch (deleteError) {
      console.error("루트 삭제 실패:", deleteError);
      setActionError("지우지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      return;
    } finally {
      setIsBusy(false);
    }

    setRoutes((previous) => previous.filter((route) => route.id !== targetId));
    setDeleteTarget(null);
  }

  const closeModals = useCallback(() => {
    if (isBusy) return;
    setEditTarget(null);
    setDeleteTarget(null);
    setActionError(null);
  }, [isBusy]);

  if (loading) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-5 pb-24"
        role="status"
        aria-label="루트 불러오는 중"
      >
        <span className="san-ripples">
          <i />
          <i />
          <i />
        </span>
        <p className="m-0 text-[13px] text-san-text">걸음을 펼치고 있어요</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 pb-24 text-center text-[13px] text-san-error">
        {error}
      </div>
    );
  }

  if (!routes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 pb-24 text-center">
        <span className="san-ripples" style={{ ["--size" as string]: "96px" }}>
          <i />
          <i />
          <i />
        </span>
        <p className="san-title mt-8">아직 남은 걸음이 없어요</p>
      </div>
    );
  }

  if (view === "log") {
    return (
      <motion.div
        key="log"
        className="h-full"
        {...screenMotion(reducedMotion)}
      >
        <RouteLog routes={routes} onSelect={onSelect} />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="grid"
      {...screenMotion(reducedMotion)}
      className="h-full overflow-y-auto overscroll-contain"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 108px)" }}
      onClick={(event) => {
        if (editing && event.target === event.currentTarget) setEditing(false);
      }}
    >
      {editing && (
        <div className="sticky top-0 z-20 flex items-center justify-between bg-san-veil px-5 py-2 backdrop-blur-md">
          <span className="text-[12.5px] text-san-text">
            고치거나 지울 걸음을 골라주세요
          </span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="san-pill min-h-11 px-5 text-[13px]"
          >
            완료
          </button>
        </div>
      )}

      <div className="mx-auto grid max-w-3xl grid-cols-2 content-start gap-3 p-4 sm:grid-cols-3 md:gap-4 md:p-6">
        {routes.map((route, index) => (
          <motion.article
            key={route.id}
            initial={reducedMotion ? false : { opacity: 0, filter: "blur(8px)" }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              transition: reducedMotion
                ? { duration: 0 }
                : {
                    duration: 0.6,
                    delay: 0.06 + Math.min(index, 12) * 0.04,
                    ease: [0.22, 1, 0.36, 1],
                  },
            }}
            className="relative"
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
              className={`flex aspect-[1.02] w-full touch-pan-y select-none flex-col justify-between overflow-hidden rounded-[22px] border-0 bg-san-surface p-4 text-left text-san-text transition-opacity duration-500 ease-ambient [-webkit-touch-callout:none] active:opacity-70 ${
                editing ? "opacity-60" : ""
              }`}
              aria-label={`${route.title} 루트 열기`}
            >
              <span className="block h-[46%] w-full text-san-text">
                <RouteTrace coordinates={route.coordinates} />
              </span>
              <span className="block min-w-0">
                <span className="line-clamp-2 block break-words text-[14px] font-normal leading-5">
                  {route.title}
                </span>
                <span className="san-data mt-2 flex items-center gap-2">
                  <span>{formatDistance(route.distance_meters)}</span>
                  <span className="san-dot h-[3px] w-[3px]" aria-hidden="true" />
                  <span>{formatDate(route.started_at ?? route.created_at)}</span>
                  {(route.route_places?.length ?? 0) > 0 && (
                    <span
                      className="san-dot san-dot-star ml-auto"
                      aria-label={`장소 ${route.route_places.length}곳`}
                    />
                  )}
                </span>
              </span>
            </button>

            {editing && (
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  aria-label={`${route.title} 이름 수정`}
                  onClick={() => {
                    setActionError(null);
                    setEditTarget(route);
                  }}
                  className="san-icon-btn h-11 w-11 bg-san-bg"
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
                  className="san-icon-btn h-11 w-11 bg-san-bg text-san-error"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </motion.article>
        ))}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            <AnimatePresence>
            {editTarget && (
              <RouteTitleModal
                key="edit-route"
                defaultTitle={editTarget.title}
                heading="이름을 고쳐 적기"
                description="이 걸음에 새 이름을 붙여주세요."
                confirmLabel="고치기"
                isSaving={isBusy}
                errorMessage={actionError}
                onConfirm={handleEditConfirm}
                onCancel={closeModals}
              />
            )}
            </AnimatePresence>
            <AnimatePresence>
            {deleteTarget && (
              <DeleteRouteModal
                key="delete-route"
                title={deleteTarget.title}
                isBusy={isBusy}
                errorMessage={actionError}
                onConfirm={handleDeleteConfirm}
                onCancel={closeModals}
              />
            )}
            </AnimatePresence>
          </>,
          document.body,
        )}
    </motion.div>
  );
}