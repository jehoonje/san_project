"use client";

import type { ReactNode } from "react";
import { LiquidGlassNav } from "webgl-liquid-glass";

export type Tab = "record" | "myroute";

type BottomNavProps = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m3.5 6.5 5-2.5 7 2.5 5-2.5v13.5l-5 2.5-7-2.5-5 2.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.5 4v13.5M15.5 6.5V20" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.5 17h2.25a2.25 2.25 0 0 0 0-4.5H10a2.5 2.5 0 0 1 0-5h5.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const items: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "record", label: "지도", icon: <MapIcon /> },
  { id: "myroute", label: "내 루트", icon: <RouteIcon /> },
];

export function BottomNav({ tab, onChange }: BottomNavProps) {
  return (
    <LiquidGlassNav
      className="san-bottom-nav"
      items={items}
      activeItem={tab}
      onItemChange={(id) => onChange(id as Tab)}
      activeColor="#ff7959"
      inactiveColor="rgba(255,255,255,0.55)"
      style={{
        zIndex: 70,
        bottom: "max(14px, env(safe-area-inset-bottom))",
      }}
    />
  );
}