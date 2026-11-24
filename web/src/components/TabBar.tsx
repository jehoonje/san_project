"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
};

type TabBarProps<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onSelect: (id: T) => void;
  reducedMotion?: boolean;
};

/**
 * 하단 내비게이션. 어느 화면에서나 같은 자리, 같은 모양으로 둡니다.
 * 선택된 탭은 면이 한 톤 진해지고 글자가 잉크색이 됩니다.
 */
export function TabBar<T extends string>({
  items,
  value,
  onSelect,
  reducedMotion = false,
}: TabBarProps<T>) {
  return (
    <div
      className="pointer-events-auto grid w-full max-w-[333px] gap-1 rounded-full bg-san-bg p-1.5"
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        boxShadow: "inset 0 0 0 1px var(--san-border)",
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!active) onSelect(item.id);
            }}
            className={`relative flex min-h-[56px] select-none flex-col items-center justify-center gap-0.5 rounded-full border-0 bg-transparent outline-none transition-colors duration-200 [-webkit-tap-highlight-color:transparent] focus-visible:ring-1 focus-visible:ring-san-line-strong ${
              active ? "text-san-text" : "text-san-muted"
            }`}
          >
            {active && (
              <motion.span
                layoutId="san-tab-active"
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-san-surface"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
                }
              />
            )}
            <span className="relative grid place-items-center">{item.icon}</span>
            <span className="relative text-[13px] leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
