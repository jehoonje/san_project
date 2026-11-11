"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { LiquidGlassLayer } from "./LiquidGlassLayer";
import { GlassTabBar } from "./GlassTabBar";

export type MainTab = "map" | "record" | "routes";

type MapTabLayoutProps = {
  tab: MainTab;
  onTabChange: (tab: MainTab) => void;
  map: ReactNode;
  topBar: ReactNode;
  overview: ReactNode;
  recordingControls: ReactNode;
  routes: ReactNode;
  mapControls?: ReactNode;
  onFocusCurrentLocation: (options: {
    reducedMotion: boolean;
  }) => void | Promise<void>;
  onRestoreMapView?: (options: {
    reducedMotion: boolean;
  }) => void | Promise<void>;
};

const tabs: Array<{
  id: MainTab;
  label: string;
  icon: "map" | "record" | "routes";
}> = [
  { id: "map", label: "Map", icon: "map" },
  { id: "record", label: "Record", icon: "record" },
  { id: "routes", label: "My Routes", icon: "routes" },
];


const GLASS_SHADOW = [
  "inset 0 1px 0.5px rgba(255,255,255,0.5)",
  "inset 0 -1px 0.5px rgba(255,255,255,0.08)",
  "inset 0 0 20px rgba(255,255,255,0.05)",
  "0 10px 34px rgba(0,0,0,0.45)",
  "0 2px 8px rgba(0,0,0,0.3)",
].join(", ");

const PILL_SHADOW = [
  "inset 0 1px 1px rgba(255,255,255,0.6)",
  "inset 0 -1px 2px rgba(255,255,255,0.12)",
  "0 2px 10px rgba(0,0,0,0.28)",
].join(", ");

function TabIcon({ type }: { type: "map" | "record" | "routes" }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "map" && (
        <>
          <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" />
          <path d="M9 3v16M15 5v16" />
        </>
      )}

      {type === "record" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
        </>
      )}

      {type === "routes" && (
        <>
          <circle cx="6" cy="5" r="2" />
          <circle cx="18" cy="19" r="2" />
          <path d="M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7" />
        </>
      )}
    </svg>
  );
}

export function MapTabLayout({
  tab,
  onTabChange,
  map,
  topBar,
  overview,
  recordingControls,
  routes,
  mapControls,
  onFocusCurrentLocation,
  onRestoreMapView,
}: MapTabLayoutProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const scopeId = useId();
  const requestId = useRef(0);
  const [locationError, setLocationError] = useState<string | null>(null);

  const isMap = tab === "map";
  const isRecord = tab === "record";
  const isRoutes = tab === "routes";

  const enterTransition = reducedMotion
    ? { duration: 0 }
    : {
        type: "spring" as const,
        stiffness: 260,
        damping: 28,
        mass: 0.9,
      };

  async function selectTab(nextTab: MainTab) {
    if (nextTab === tab) return;

    const currentRequest = ++requestId.current;
    setLocationError(null);
    onTabChange(nextTab);

    try {
      if (nextTab === "record") {
        await onFocusCurrentLocation({ reducedMotion });
      } else if (nextTab === "map") {
        await onRestoreMapView?.({ reducedMotion });
      }
    } catch {
      if (currentRequest === requestId.current && nextTab === "record") {
        setLocationError(
          "현재 위치로 이동하지 못했어요. 위치 권한을 확인해주세요.",
        );
      }
    }
  }

  return (
    <div
      className="relative isolate h-dvh min-h-[480px] w-full overflow-hidden bg-black text-white"
      style={{
        fontFamily: "var(--font-body, Pretendard, sans-serif)",
      }}
    >
      {/*
       * MapView는 내 지도/기록 탭 사이에서 크기와 DOM 위치를 바꾸지 않습니다.
       * 같은 MapLibre 인스턴스가 계속 살아 있으므로 타일 재로딩과 깜박임을 막습니다.
       */}
      <div
        className="absolute inset-0 z-0"
        aria-hidden={isRoutes || undefined}
        inert={isRoutes}
        style={{
          visibility: isRoutes ? "hidden" : "visible",
          pointerEvents: isRoutes ? "none" : "auto",
        }}
      >
        {map}
      </div>

      {!isRoutes && mapControls ? (
        <div
          className="pointer-events-auto absolute right-4 z-[35]"
          style={{ bottom: "24%" }}
        >
          {mapControls}
        </div>
      ) : null}

      {/* 상단 정보 음영은 지도 위에서만 페이드됩니다. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%]"
        initial={false}
        animate={{
          opacity: isRoutes ? 0 : isMap ? 1 : 0.58,
          y: isRoutes ? -24 : 0,
        }}
        transition={{
          duration: reducedMotion ? 0 : 0.42,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.82) 0%, rgba(0,0,0,.38) 46%, rgba(0,0,0,0) 100%)",
        }}
      />

      {!isRoutes && (
        <header
          className="pointer-events-none absolute inset-x-0 top-0 z-30 px-5"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          }}
        >
          <div className="pointer-events-auto">{topBar}</div>
        </header>
      )}

      <AnimatePresence initial={false} mode="sync">
        {isMap && (
          <motion.div
            key="map-information"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[62%]"
            initial={{
              opacity: reducedMotion ? 1 : 0,
              y: reducedMotion ? 0 : "72%",
            }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: reducedMotion ? 0 : 0.2,
              y: reducedMotion ? 0 : "82%",
            }}
            transition={enterTransition}
          >
            {/* 단계형 blur와 암부를 정보 패널과 함께 이동시킵니다. */}
            <div aria-hidden="true" className="absolute inset-0">
              {[2, 5, 10].map((blur, index) => {
                const start = index * 17;

                return (
                  <div
                    key={blur}
                    className="absolute inset-0"
                    style={{
                      backdropFilter: `blur(${blur}px)`,
                      WebkitBackdropFilter: `blur(${blur}px)`,
                      maskImage: `linear-gradient(to bottom, transparent ${start}%, black ${start + 40}%)`,
                      WebkitMaskImage: `linear-gradient(to bottom, transparent ${start}%, black ${start + 40}%)`,
                    }}
                  />
                );
              })}

              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.2) 22%, rgba(0,0,0,.76) 54%, #000 82%, #000 100%)",
                }}
              />
            </div>

            <section
              aria-label="현재 지도 지역 정보"
              className="pointer-events-auto absolute inset-x-0 mx-auto max-w-3xl overflow-y-auto overscroll-contain px-6"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 108px)",
                maxHeight: "42dvh",
                scrollbarWidth: "none",
              }}
            >
              <motion.div
                initial={{
                  opacity: reducedMotion ? 1 : 0,
                  y: reducedMotion ? 0 : 24,
                }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.42,
                  delay: reducedMotion ? 0 : 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {overview}
              </motion.div>
            </section>
          </motion.div>
        )}

        {isRecord && (
          <motion.section
            key="recording-controls"
            aria-label="루트 기록"
            className="pointer-events-none absolute inset-x-0 z-20 mx-auto max-w-xl px-4"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)",
            }}
            initial={{
              opacity: reducedMotion ? 1 : 0,
              y: reducedMotion ? 0 : 52,
              scale: reducedMotion ? 1 : 0.98,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : 28,
              scale: reducedMotion ? 1 : 0.985,
            }}
            transition={enterTransition}
          >
            {locationError && (
              <p
                role="status"
                className="mb-3 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm leading-relaxed text-white/80 backdrop-blur-xl"
              >
                {locationError}
              </p>
            )}

            <div className="pointer-events-auto">{recordingControls}</div>
          </motion.section>
        )}
      </AnimatePresence>

      <div
        className={
          isRoutes ? "absolute inset-0 z-40" : "hidden"
        }
        aria-hidden={!isRoutes || undefined}
        inert={!isRoutes}
      >
        {/* 마이루트 진입: 흐림 속에서 또렷해지는 앰비언트 전환 */}
        <motion.div
          key={isRoutes ? "routes-on" : "routes-off"}
          className="absolute inset-0"
          initial={
            reducedMotion ? false : { opacity: 0, scale: 1.015, filter: "blur(12px)" }
          }
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{
            duration: reducedMotion ? 0 : 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {routes}
        </motion.div>
      </div>

      {/* 리퀴드 글래스 플로팅 탭바 (굴절 필터 + 폴백) */}
      <nav
        aria-label="메인 메뉴"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center px-5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <GlassTabBar
          items={tabs.map((t) => ({
            id: t.id,
            label: t.label,
            icon: <TabIcon type={t.icon} />,
          }))}
          value={tab}
          onSelect={(id) => void selectTab(id)}
          reducedMotion={reducedMotion}
        />
      </nav>
    </div>
  );
}