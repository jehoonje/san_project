"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { dialogMotion, toastMotion } from "@/lib/motion";
import { MAP_ATTRIBUTION, MAP_FONT, buildMapStyle, readMapPalette } from "@/lib/mapStyle";
import { onThemeChange, readToken } from "@/lib/themeTokens";
import { postToNative } from "@/lib/nativeBridge";
import { listRoutes, type RouteOwner } from "@/lib/routeStore";
import {
  HEAT_LEVELS,
  buildHeat,
  heatFromCounts,
  heatLegend,
  labelPoints,
  levelAtZoom,
  paintLevel,
  type HeatCountsJSON,
  type HeatData,
  type HeatLevel,
} from "@/lib/regionHeat";

type GlobeViewProps = {
  owner: RouteOwner;
  /** 지금 내 위치 (메인 지도에서 받아옴) */
  getLocation: () => [number, number] | null;
  onClose: () => void;
};

/** 보기: 내가 남긴 장소 / 모든 사람이 남긴 장소 */
type Scope = "mine" | "all";

/** 내 위치로 들어갈 때의 줌 (동 단계) */
const NEAR_ZOOM = 12.2;

/** 처음 비추는 곳: 대한민국 */
const KOREA: [number, number] = [127.8, 36.2];
const MAX_ZOOM = 13.5;
/** 지구 지름이 화면 짧은 변에서 차지하는 비율 */
const GLOBE_FILL = 0.92;
/** 이만큼(px) 굴릴 때마다 짧은 햅틱 */
const TICK_PX = 42;
const TICK_MIN_MS = 70;

const ATTRIBUTION = `${MAP_ATTRIBUTION} · 행정구역 © 통계청 SGIS (공공누리 제1유형)`;

/**
 * 줌아웃을 끝까지 했을 때 지구 전체가 화면 가운데에 꽉 차도록 하는 줌.
 * MapLibre 지구본의 반지름(px) ≈ 512·2^z / (2π) / cos(위도)  →  z 를 거꾸로 구함.
 */
function fitZoom(width: number, height: number, lat: number) {
  const radius = (Math.min(width, height) / 2) * GLOBE_FILL;
  const z = Math.log2(((radius * 2 * Math.PI) / 512) * Math.cos((lat * Math.PI) / 180));
  return Math.max(0, z);
}

function heatColors() {
  return [1, 2, 3, 4, 5].map((step) => readToken(`--san-heat-${step}`, "#a37034"));
}

function fillColor(colors: string[]) {
  return [
    "match",
    ["get", "h"],
    1, colors[0],
    2, colors[1],
    3, colors[2],
    4, colors[3],
    5, colors[4],
    "rgba(0,0,0,0)",
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** 단계가 바뀌는 줌 언저리에서 겹쳐 흐려지며 넘어감 */
function levelOpacity(index: number, peak: number) {
  const start = HEAT_LEVELS[index].minZoom;
  const end = HEAT_LEVELS[index + 1]?.minZoom ?? 99;
  const stops: number[] = [];
  if (index === 0) {
    stops.push(0, peak);
  } else {
    stops.push(start - 0.35, 0, start + 0.25, peak);
  }
  if (end < 99) stops.push(end - 0.25, peak, end + 0.35, 0);
  else stops.push(MAX_ZOOM + 1, peak);
  return ["interpolate", ["linear"], ["zoom"], ...stops] as unknown as maplibregl.ExpressionSpecification;
}

function haptic(style: "tick" | "level") {
  const native = typeof window !== "undefined" && "ReactNativeWebView" in window;
  if (native) {
    postToNative({ type: "HAPTIC", style });
  } else if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(style === "tick" ? 4 : 12);
  }
}

function BackIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 18-6-6 6-6" />
    </svg>
  );
}

// 줌인: 내 위치 (점과 둘레 원)
function NearIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5" />
    </svg>
  );
}

// 줌아웃: 지구 전체
function GlobeIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5Z" />
    </svg>
  );
}

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "mine", label: "나" },
  { id: "all", label: "모두" },
];

const ERRORS: Record<string, string> = {
  configuration_missing: "모두의 분포를 아직 볼 수 없어요",
};

type Picked = { label: string; count: number; level: HeatLevel };

export function GlobeView({ owner, getLocation, onClose }: GlobeViewProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const heatRef = useRef<HeatData | null>(null);
  const [heat, setHeat] = useState<HeatData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("불러오지 못했어요");
  const [scope, setScope] = useState<Scope>("mine");
  const [near, setNear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [level, setLevel] = useState<HeatLevel>("country");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [mounted, setMounted] = useState(false);
  const ownerKey = owner.kind === "user" ? owner.userId : "guest";

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // 남긴 장소 → 구역별 집계 (나: 브라우저에서 / 모두: 서버가 센 숫자만)
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setStatus("loading");
        setPicked(null);
      }
    });

    const load =
      scope === "mine"
        ? listRoutes(owner).then((routes) =>
            buildHeat(
              routes.flatMap((route) =>
                (route.route_places ?? []).map((place) => ({ lat: place.lat, lng: place.lng })),
              ),
            ),
          )
        : fetch("/api/place-heat")
            .then(async (res) => {
              const json = (await res.json().catch(() => null)) as
                | { counts?: HeatCountsJSON; total?: number; error?: string }
                | null;
              if (!res.ok || !json?.counts) throw new Error(json?.error ?? "heat_failed");
              return heatFromCounts(json.counts, Number(json.total) || 0);
            });

    load
      .then((data) => {
        if (cancelled) return;
        heatRef.current = data;
        setHeat(data);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("지구본 집계 실패:", error);
        if (cancelled) return;
        setErrorText(ERRORS[error instanceof Error ? error.message : ""] ?? "불러오지 못했어요");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // owner 는 식별 키로만 다시 불러옴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, scope]);

  // 안내 한 줄은 잠깐만
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Escape 로 닫기
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 지구본
  useEffect(() => {
    const container = containerRef.current;
    if (!mounted || !container) return;

    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

    const palette = readMapPalette();
    const base = buildMapStyle(palette);
    const minZoom = fitZoom(container.clientWidth, container.clientHeight, KOREA[1]);

    const sky = () => ({
      "sky-color": readToken("--san-sky", "#e4e7ec"),
      "horizon-color": readToken("--san-orb-cool", "#bccadb"),
      "fog-color": readToken("--san-sky", "#e4e7ec"),
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": [
        "interpolate", ["linear"], ["zoom"], 0, 1, 5, 0.8, 8, 0,
      ] as unknown as maplibregl.ExpressionSpecification,
    });

    const map = new maplibregl.Map({
      container,
      style: {
        ...base,
        // 3D 건물은 지구본에서 쓰지 않음
        layers: base.layers.filter((layer) => layer.id !== "building"),
        projection: { type: "globe" },
        sky: sky(),
      },
      center: KOREA,
      zoom: minZoom,
      minZoom,
      maxZoom: MAX_ZOOM,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      attributionControl: false,
      fadeDuration: reduce ? 0 : 300,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
      "bottom-right",
    );
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __sanGlobe?: maplibregl.Map }).__sanGlobe = map;
    }

    // 출처 표기는 접힌 채로 (i 를 누르면 펼쳐짐)
    const collapseAttribution = () => {
      const el = container.querySelector(".maplibregl-ctrl-attrib");
      el?.classList.remove("maplibregl-compact-show");
      el?.removeAttribute("open");
    };
    map.once("load", collapseAttribution);
    window.setTimeout(collapseAttribution, 0);

    const resize = () => {
      const next = fitZoom(container.clientWidth, container.clientHeight, KOREA[1]);
      map.setMinZoom(next);
      map.resize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // 굴리는 동안의 햅틱: 화면에서 움직인 거리만큼 짧게 톡톡
    let lastCenter = map.getCenter();
    let lastZoom = map.getZoom();
    let travelled = 0;
    let lastTick = 0;
    let lastLevel: HeatLevel = levelAtZoom(map.getZoom());

    const onMove = (event: { originalEvent?: unknown }) => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (event.originalEvent) {
        const before = map.project(lastCenter);
        const now = map.project(center);
        travelled += Math.hypot(now.x - before.x, now.y - before.y);
        travelled += Math.abs(zoom - lastZoom) * 90;
        const clock = performance.now();
        if (travelled >= TICK_PX && clock - lastTick > TICK_MIN_MS) {
          travelled = 0;
          lastTick = clock;
          haptic("tick");
        }
      }
      lastCenter = center;
      lastZoom = zoom;

      if (event.originalEvent) {
        // 손으로 끝까지 줄이면 "지구 전체" 상태로 맞춤
        if (zoom <= map.getMinZoom() + 0.3) setNear(false);
        else if (zoom >= NEAR_ZOOM - 1) setNear(true);
      }

      const nextLevel = levelAtZoom(zoom);
      if (nextLevel !== lastLevel) {
        lastLevel = nextLevel;
        setLevel(nextLevel);
        setPicked(null);
        haptic("level");
      }
    };
    map.on("move", onMove);

    const fillIds = HEAT_LEVELS.map((item) => `heat-${item.id}-fill`);

    const paint = () => {
      const data = heatRef.current;
      // 타일이 늦게 와도 칠할 수 있도록 스타일 전체 로드가 아니라 소스 존재만 확인
      if (!data || !map.getSource("heat-country")) return;
      for (const item of HEAT_LEVELS) {
        const source = map.getSource(`heat-${item.id}`) as maplibregl.GeoJSONSource | undefined;
        source?.setData(paintLevel(data, item.id));
        const labels = map.getSource(`heat-${item.id}-labels`) as
          | maplibregl.GeoJSONSource
          | undefined;
        labels?.setData(labelPoints(data, item.id));
      }
    };

    const addLayers = () => {
      const colors = heatColors();
      const line = readToken("--san-border-strong", "rgba(46,52,64,.3)");
      HEAT_LEVELS.forEach((item, index) => {
        const id = `heat-${item.id}`;
        map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer(
          {
            id: `${id}-fill`,
            type: "fill",
            source: id,
            paint: {
              "fill-color": fillColor(colors),
              "fill-opacity": levelOpacity(index, 0.88),
              "fill-antialias": false,
            },
          },
          "water-name",
        );
        // 구·동 단계에서만 가는 경계선 (나라·도·시는 면으로만)
        if (item.id === "sgg" || item.id === "emd" || item.id === "sido") {
          map.addLayer(
            {
              id: `${id}-line`,
              type: "line",
              source: id,
              paint: {
                "line-color": line,
                "line-width": 0.6,
                "line-opacity": levelOpacity(index, item.id === "emd" ? 0.55 : 0.7),
              },
            },
            "water-name",
          );
        }
      });

      // 색칠된 구역마다 총 개수: 면 위에 작은 숫자 (가독성을 위해 바탕색 테두리)
      const ink = readToken("--san-text", "#2e3440");
      const paper = readToken("--san-background", "#f2f2ef");
      HEAT_LEVELS.forEach((item, index) => {
        const id = `heat-${item.id}-labels`;
        map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // 단계마다 자기 줌 범위에서만 존재 (안 보이는 단계의 숫자가 자리를 차지하지 않게)
        const minzoom = index === 0 ? 0 : item.minZoom;
        const maxzoom = HEAT_LEVELS[index + 1]?.minZoom ?? 24;
        map.addLayer({
          id,
          type: "symbol",
          source: id,
          minzoom,
          maxzoom,
          layout: {
            "text-field": ["get", "t"],
            "text-font": MAP_FONT,
            "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 10, 13],
            "text-letter-spacing": 0.06,
            // 나라·도·시는 구역이 적어 숫자를 모두 보여주고, 구·동은 겹치면 큰 수부터
            "text-allow-overlap": index <= 2,
            "text-padding": 4,
            // 많이 남긴 곳의 숫자가 먼저 자리를 차지
            "symbol-sort-key": ["-", 0, ["get", "v"]],
          },
          paint: {
            "text-color": ink,
            "text-halo-color": paper,
            "text-halo-width": 1.8,
          },
        });
      });
      paint();
    };

    map.on("load", addLayers);

    const onClick = (event: maplibregl.MapMouseEvent) => {
      const current = levelAtZoom(map.getZoom());
      const hit = map.queryRenderedFeatures(event.point, {
        layers: [`heat-${current}-fill`],
      })[0];
      const props = hit?.properties as { label?: string; v?: number } | undefined;
      if (!props?.label) {
        setPicked(null);
        return;
      }
      setPicked({ label: props.label, count: Number(props.v) || 0, level: current });
    };
    map.on("click", onClick);
    for (const id of fillIds) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }

    const stopTheme = onThemeChange(() => {
      if (!map.getSource("heat-country")) return;
      const colors = heatColors();
      const line = readToken("--san-border-strong", "rgba(46,52,64,.3)");
      for (const item of HEAT_LEVELS) {
        if (map.getLayer(`heat-${item.id}-fill`)) {
          map.setPaintProperty(`heat-${item.id}-fill`, "fill-color", fillColor(colors));
        }
        if (map.getLayer(`heat-${item.id}-line`)) {
          map.setPaintProperty(`heat-${item.id}-line`, "line-color", line);
        }
      }
      for (const item of HEAT_LEVELS) {
        const id = `heat-${item.id}-labels`;
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "text-color", readToken("--san-text", "#2e3440"));
          map.setPaintProperty(id, "text-halo-color", readToken("--san-background", "#f2f2ef"));
        }
      }
      map.setSky(sky());
    });

    // 집계가 지도보다 늦게 끝나면 그때 칠함
    const onData = () => paint();
    window.addEventListener("san-heat-ready", onData);

    return () => {
      stopTheme();
      window.removeEventListener("san-heat-ready", onData);
      observer.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, [mounted, reduce]);

  useEffect(() => {
    if (heat) window.dispatchEvent(new CustomEvent("san-heat-ready"));
  }, [heat]);

  // 줌 토글: 내 위치로 들어가기(동 단계) ↔ 지구 전체(나라 단계)
  function handleZoomToggle() {
    const map = mapRef.current;
    if (!map) return;
    const duration = reduce ? 0 : 1400;

    if (near) {
      map.flyTo({ center: KOREA, zoom: map.getMinZoom(), duration, essential: true });
      setNear(false);
      haptic("level");
      return;
    }

    const here = getLocation();
    if (!here) {
      setNotice("아직 내 위치를 찾지 못했어요");
      return;
    }
    map.flyTo({ center: here, zoom: NEAR_ZOOM, duration, essential: true });
    setNear(true);
    haptic("level");
  }

  function handleScope(next: Scope) {
    if (next === scope) return;
    setScope(next);
    haptic("tick");
  }

  const meta = HEAT_LEVELS.find((item) => item.id === level) ?? HEAT_LEVELS[0];
  const legend = heat ? heatLegend(heat, level) : null;

  if (!mounted) return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="방문한 곳 지구본"
      className="san-globe fixed inset-0 z-[70] bg-san-bg text-san-text"
      {...dialogMotion(reduce, "center")}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* 상단: 닫기 · 지금 보는 단계 · 처음 위치로 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex min-h-[76px] items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          className="san-icon-btn pointer-events-auto"
          onClick={onClose}
          aria-label="지구본 닫기"
        >
          <BackIcon />
        </button>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={level}
            className="san-eyebrow absolute left-1/2 m-0 -translate-x-1/2"
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: reduce ? 0 : 0.36 }}
          >
            {meta.code}
          </motion.p>
        </AnimatePresence>

        <button
          type="button"
          className="san-icon-btn pointer-events-auto"
          onClick={handleZoomToggle}
          aria-pressed={near}
          aria-label={near ? "지구 전체 보기" : "내 위치로 확대"}
          title={near ? "지구 전체" : "내 위치"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={near ? "out" : "in"}
              className="grid place-items-center"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: reduce ? 0 : 0.3 }}
            >
              {near ? <GlobeIcon /> : <NearIcon />}
            </motion.span>
          </AnimatePresence>
        </button>
      </header>

      {/* 하단: 나 / 모두 토글 */}
      <div
        className="absolute inset-x-0 z-10 flex justify-center px-4"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 80px)" }}
      >
        <div
          className="san-veil flex gap-1 rounded-full p-1"
          role="radiogroup"
          aria-label="분포 보기"
        >
          {SCOPES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={scope === item.id}
              className={`san-pill min-h-11 px-6 text-[13px] ${
                scope === item.id ? "san-pill-fill" : "san-pill-quiet"
              }`}
              onClick={() => handleScope(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 하단: 고른 구역 + 방문 빈도 범례 */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-3 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
      >
        <AnimatePresence>
          {notice && (
            <motion.p
              key="notice"
              className="san-toast m-0"
              role="status"
              {...toastMotion(reduce)}
            >
              {notice}
            </motion.p>
          )}
          {picked && !notice && (
            <motion.div
              key={`${picked.level}-${picked.label}`}
              className="san-veil pointer-events-auto flex items-center gap-3 rounded-full px-5 py-2.5"
              {...toastMotion(reduce)}
            >
              <span className="text-[14px]">{picked.label}</span>
              <span className="san-data">{picked.count}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="san-veil pointer-events-auto flex items-center gap-4 rounded-full px-5 py-3">
          {status === "loading" && (
            <span className="flex items-center gap-3">
              <span className="san-ripples" style={{ ["--size" as string]: "22px" }}>
                <i />
                <i />
              </span>
              <span className="text-[12.5px]">불러오는 중</span>
            </span>
          )}

          {status === "error" && (
            <span className="text-[12.5px] text-san-error">{errorText}</span>
          )}

          {status === "ready" && legend && (
            heat && heat.total === 0 ? (
              <span className="text-[12.5px]">
                {scope === "mine" ? "아직 남긴 장소가 없어요" : "아직 모인 장소가 없어요"}
              </span>
            ) : (
              <>
                <span
                  className="san-data flex items-baseline gap-1.5"
                  aria-label={`총 ${heat?.total ?? 0}개, ${meta.label} 단위 ${legend.visited}곳`}
                >
                  <span className="text-[10px] tracking-[0.16em]">TOTAL</span>
                  <span className="text-[14px] font-medium">{heat?.total ?? 0}</span>
                </span>
                <span
                  className="flex items-center gap-1.5"
                  role="img"
                  aria-label={`방문 빈도 1회부터 ${legend.max}회까지 다섯 단계`}
                >
                  <span className="san-data">1</span>
                  {[1, 2, 3, 4, 5].map((step) => (
                    <span
                      key={step}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: `var(--san-heat-${step})` }}
                    />
                  ))}
                  <span className="san-data">{legend.max}</span>
                </span>
              </>
            )
          )}
        </div>
      </div>

      <style jsx global>{`
        .san-globe .maplibregl-ctrl-bottom-right {
          bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
          right: 8px;
        }
        .san-globe .maplibregl-ctrl-attrib {
          max-width: min(280px, calc(100vw - 32px));
        }
        .san-globe .maplibregl-canvas {
          outline: none;
        }
      `}</style>
    </motion.div>,
    document.body,
  );
}
