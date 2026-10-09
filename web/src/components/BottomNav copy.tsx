// web/src/components/BottomNav.tsx
"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import styles from "./BottomNav.module.css";

export type Tab = "map" | "record" | "myroute";

type BottomNavProps = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

type NavItem = {
  key: Tab;
  label: string;
  icon: ReactNode;
};

const SPRING = { type: "spring", stiffness: 360, damping: 30 } as const;

function MapIcon() {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.5 6.5 5-2.5 7 2.5 5-2.5v13.5l-5 2.5-7-2.5-5 2.5Z" />
      <path d="M8.5 4v13.5M15.5 6.5V20" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5" />
    </svg>
  );
}

const ITEMS: NavItem[] = [
  { key: "map", label: "내 지도", icon: <MapIcon /> },
  { key: "record", label: "기록", icon: <RecordIcon /> },
  { key: "myroute", label: "내 루트", icon: <RouteIcon /> },
];

export function BottomNav({ tab, onChange }: BottomNavProps) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className={styles.root} aria-label="주요 메뉴">
      <motion.div
        className={styles.glass}
        initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        {ITEMS.map((item) => {
          const active = tab === item.key;

          return (
            <motion.button
              type="button"
              key={item.key}
              className={styles.item}
              onClick={() => onChange(item.key)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              transition={SPRING}
            >
              {active ? (
                <motion.span
                  className={styles.activeGlass}
                  layoutId="bottom-nav-active"
                  transition={reduceMotion ? { duration: 0 } : SPRING}
                />
              ) : null}

              <motion.span
                className={styles.icon}
                animate={active ? { y: -1, scale: 1.04 } : { y: 0, scale: 1 }}
                transition={reduceMotion ? { duration: 0 } : SPRING}
              >
                {item.icon}
              </motion.span>
              <span className={styles.label}>{item.label}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </nav>
  );
}
