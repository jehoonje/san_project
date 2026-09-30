// web/src/components/BottomNav.tsx
"use client";

export type Tab = "record" | "myroute";

type BottomNavProps = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

function RecordIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6" />
    </svg>
  );
}

export function BottomNav({ tab, onChange }: BottomNavProps) {
  const items: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "record", label: "Record", icon: <RecordIcon /> },
    { key: "myroute", label: "My Route", icon: <RouteIcon /> },
  ];

  return (
    <nav className="relative z-40 flex h-16 shrink-0 border-t border-neutral-200 bg-white">
      {items.map((item) => {
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
              active ? "text-[#ff5a36]" : "text-neutral-400"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}