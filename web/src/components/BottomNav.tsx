"use client";

import { motion } from "motion/react";

export type Tab = "record" | "myroute";

type BottomNavProps = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

function MapIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3.5 6.5 5-2.5 7 2.5 5-2.5v13.5l-5 2.5-7-2.5-5 2.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 4v13.5M15.5 6.5V20"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="6"
        cy="17"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle
        cx="18"
        cy="7"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.5 17h2.25a2.25 2.25 0 0 0 0-4.5H10a2.5 2.5 0 0 1 0-5h5.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const items: Array<{
  key: Tab;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    key: "record",
    label: "지도",
    icon: <MapIcon />,
  },
  {
    key: "myroute",
    label: "내 루트",
    icon: <RouteIcon />,
  },
];

export function BottomNav({
  tab,
  onChange,
}: BottomNavProps) {
  return (
    <nav
      className="san-bottom-nav fixed inset-x-0 bottom-0 z-[70] grid grid-cols-2 bg-[linear-gradient(180deg,rgba(5,7,10,0)_0%,rgba(5,7,10,0.92)_30%,#05070a_54%)] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-8"
      aria-label="메인 메뉴"
    >
      {items.map((item) => {
        const active = tab === item.key;

        return (
          <motion.button
            key={item.key}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onChange(item.key)}
            className={[
              "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl",
              "text-[12px] font-semibold transition-colors",
              active
                ? "text-[#ff7959]"
                : "text-white/42",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
          >
            {active ? (
              <motion.span
                layoutId="san-bottom-nav-active"
                className="absolute inset-x-[18%] inset-y-0 rounded-2xl border border-white/8 bg-white/[0.055]"
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 34,
                }}
              />
            ) : null}

            <motion.span
              className="relative z-10"
              animate={{
                y: active ? -1 : 0,
                scale: active ? 1.04 : 1,
              }}
            >
              {item.icon}
            </motion.span>

            <span className="relative z-10">
              {item.label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}