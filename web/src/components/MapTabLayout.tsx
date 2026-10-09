"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";

export type MainTab = "map" | "record" | "routes";

type MapTabLayoutProps = {
  tab: MainTab;
  onTabChange: (tab: MainTab) => void;

  /**
   * 같은 MapView를 항상 전달하세요.
   * tab에 따라 key를 바꾸거나 다른 MapView로 교체하지 않습니다.
   */
  map: ReactNode;

  /** 기존 TopBar */
  topBar: ReactNode;

  /** 기존 RegionOverview */
  overview: ReactNode;

  /**
   * 기존 기록 컨트롤.
   * 이 영역 안에서는 fixed/absolute bottom 스타일을 제거하세요.
   */
  recordingControls: ReactNode;

  /** 기존 RouteGrid / RouteViewer. 디자인 변경 없이 전달 */
  routes: ReactNode;

  /**
   * 실제 지도 인스턴스에서 현재 위치로 카메라를 이동하는 함수.
   * 위치 권한 실패 시 throw하면 화면에 오류를 표시합니다.
   */
  onFocusCurrentLocation: (options: {
    reducedMotion: boolean;
  }) => void | Promise<void>;

  /** 선택: 지도 탭 복귀 시 기존 카메라 복원 */
  onRestoreMapView?: (options: {
    reducedMotion: boolean;
  }) => void | Promise<void>;
};

const tabs: Array<{
  id: MainTab;
  label: string;
  icon: "map" | "record" | "routes";
}> = [
  { id: "map", label: "내 지도", icon: "map" },
  { id: "record", label: "기록", icon: "record" },
  { id: "routes", label: "내 루트", icon: "routes" },
];

function TabIcon({ type }: { type: "map" | "record" | "routes" }) {
  return (
    <svg
      width="24"
      height="24"
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

  const transition = {
    duration: reducedMotion ? 0 : 0.55,
    ease: [0.22, 1, 0.36, 1] as const,
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
      {/* 지도는 탭 변경 시에도 마운트된 상태로 유지 */}
      <div
        className="absolute inset-x-0 top-0 z-0"
        aria-hidden={isRoutes || undefined}
        inert={isRoutes}
        style={{
          height: isMap ? "72%" : "100%",
          visibility: isRoutes ? "hidden" : "visible",
          transition: reducedMotion
            ? "none"
            : "height 550ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {map}
      </div>

      {/* 상단 그라데이션 */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[28%]"
        initial={false}
        animate={{
          opacity: isMap ? 1 : 0,
          y: isMap ? "0%" : "-100%",
        }}
        transition={transition}
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.86) 0%, rgba(0,0,0,.44) 42%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* 下쪽 점진적 블러 */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[48%]"
        initial={false}
        animate={{
          opacity: isMap ? 1 : 0,
          y: isMap ? "0%" : "100%",
        }}
        transition={transition}
      >
        {[2, 5, 10].map((blur, index) => {
          const start = index * 18;

          return (
            <div
              key={blur}
              className="absolute inset-0"
              style={{
                backdropFilter: `blur(${blur}px)`,
                WebkitBackdropFilter: `blur(${blur}px)`,
                maskImage: `linear-gradient(to bottom, transparent ${start}%, black ${start + 38}%)`,
                WebkitMaskImage: `linear-gradient(to bottom, transparent ${start}%, black ${start + 38}%)`,
              }}
            />
          );
        })}
      </motion.div>

      {/* 지도 → 검정 정보 영역으로 이어지는 그라데이션 */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] h-[48%]"
        initial={false}
        animate={{
          opacity: isMap ? 1 : 0,
          y: isMap ? "0%" : "100%",
        }}
        transition={transition}
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.3) 23%, rgba(0,0,0,.88) 53%, #000 76%, #000 100%)",
        }}
      />

      {/* 원형 글래스 TopBar: 외부 기존 컴포넌트 재사용 */}
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

      <AnimatePresence initial={false}>
        {isMap && (
          <motion.section
            key="region-overview"
            aria-label="현재 지도 지역 정보"
            className="absolute inset-x-0 z-20 mx-auto max-w-3xl px-6"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 112px)",
              maxHeight: "36%",
              overflowY: "auto",
            }}
            initial={{
              opacity: 0,
              y: reducedMotion ? 0 : 16,
            }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : 20,
            }}
            transition={{
              ...transition,
              duration: reducedMotion ? 0 : 0.32,
            }}
          >
            {overview}
          </motion.section>
        )}

        {isRecord && (
          <motion.section
            key="recording-controls"
            aria-label="루트 기록"
            className="absolute inset-x-0 z-20 mx-auto max-w-xl px-5"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)",
            }}
            initial={{
              opacity: reducedMotion ? 1 : 0,
              y: reducedMotion ? 0 : 24,
            }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.36,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {locationError && (
              <p
                role="status"
                className="mb-3 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm leading-relaxed text-white/80"
              >
                {locationError}
              </p>
            )}

            {recordingControls}
          </motion.section>
        )}
      </AnimatePresence>

      {/* 기존 루트 화면은 디자인 변경 없이 유지 */}
      <div
        className={
          isRoutes ? "absolute inset-0 z-40 overflow-y-auto" : "hidden"
        }
        aria-hidden={!isRoutes || undefined}
        inert={!isRoutes}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
        }}
      >
        {routes}
      </div>

      {/* 전체 너비 검정 BottomNav */}
      <nav
        aria-label="메인 메뉴"
        className="absolute inset-x-0 bottom-0 z-50 bg-black px-4 pt-2"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        }}
      >
        <LayoutGroup id={scopeId}>
          <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
            {tabs.map((item) => {
              const active = item.id === tab;

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => void selectTab(item.id)}
                  whileTap={reducedMotion ? undefined : { scale: 0.96 }}
                  className={[
                    "relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl",
                    "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                    active ? "text-white" : "text-neutral-400 hover:text-white",
                  ].join(" ")}
                >
                  {active && (
                    <motion.span
                      layoutId="active-tab"
                      aria-hidden="true"
                      className="absolute inset-x-3 inset-y-1 rounded-2xl border border-white/10 bg-white/[0.07]"
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : {
                              type: "spring",
                              stiffness: 420,
                              damping: 36,
                            }
                      }
                    />
                  )}

                  <motion.span
                    className="relative"
                    initial={false}
                    animate={{ y: active ? -1 : 0 }}
                    transition={transition}
                  >
                    <TabIcon type={item.icon} />
                  </motion.span>

                  <span className="relative text-xs font-medium">
                    {item.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </nav>
    </div>
  );
}
