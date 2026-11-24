"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { DURATION, EASE_AMBIENT } from "@/lib/motion";
import { TabBar } from "./TabBar";

export type MainTab = "map" | "record" | "routes";

type MapTabLayoutProps = {
  tab: MainTab;
  onTabChange: (tab: MainTab) => void;
  map: ReactNode;
  topBar: ReactNode;
  overview: ReactNode;
  recordingControls: ReactNode;
  /** 기록 탭 상단의 걸음 수치 */
  recordHud?: ReactNode;
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
  { id: "map", label: "지도", icon: "map" },
  { id: "record", label: "기록", icon: "record" },
  { id: "routes", label: "내 기록", icon: "routes" },
];


function TabIcon({ type }: { type: "map" | "record" | "routes" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
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
          <circle cx="12" cy="12" r="3.2" />
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
  recordHud,
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

  // 튀는 스프링 대신 길게 감속하며 안착
  const enterTransition = reducedMotion
    ? { duration: 0 }
    : { duration: DURATION.enter, ease: EASE_AMBIENT };

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
    <div className="san-shell">
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

      {isRecord && mapControls ? (
        <div
          className="pointer-events-auto absolute right-4 z-[35]"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 232px)" }}
        >
          {mapControls}
        </div>
      ) : null}

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
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : 12,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: DURATION.exit, ease: "easeIn" },
            }}
            transition={enterTransition}
          >
            {mapControls ? (
              <div className="pointer-events-auto absolute -top-16 right-4">
                {mapControls}
              </div>
            ) : null}

            <section
              aria-label="현재 지도 지역 정보"
              className="pointer-events-auto mx-auto w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-san-bg px-6 pt-6"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)",
                maxHeight: "calc(42dvh + 100px)",
                scrollbarWidth: "none",
                boxShadow: "inset 0 1px 0 0 var(--san-border)",
              }}
            >
              <div className="mx-auto max-w-3xl">{overview}</div>
            </section>
          </motion.div>
        )}

        {isRecord && recordHud && (
          <motion.div
            key="record-hud"
            className="pointer-events-none absolute inset-x-0 z-20"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 80px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: DURATION.exit, ease: "easeIn" },
            }}
            transition={enterTransition}
          >
            {recordHud}
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
            initial={{ opacity: 0, y: reducedMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : 10,
              transition: reducedMotion
                ? { duration: 0 }
                : { duration: DURATION.exit, ease: "easeIn" },
            }}
            transition={enterTransition}
          >
            {locationError && (
              <p
                role="status"
                className="san-veil mb-3 rounded-[22px] px-5 py-3 text-center text-[13px] leading-relaxed text-san-text"
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
        <motion.div
          key={isRoutes ? "routes-on" : "routes-off"}
          className="absolute inset-0"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reducedMotion ? 0 : 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {routes}
        </motion.div>
      </div>

      {/* 하단 탭바: 모든 화면에서 같은 자리 */}
      <nav
        aria-label="메인 메뉴"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center px-5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <TabBar
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