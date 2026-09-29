// web/src/components/TopBar.tsx
"use client";

type TopBarProps = {
  title: string;
  isBack: boolean;
  onMenu: () => void;
  onBack: () => void;
};

export function TopBar({ title, isBack, onMenu, onBack }: TopBarProps) {
  const line =
    "absolute left-[2px] top-1/2 -mt-px h-0.5 origin-left rounded-full bg-neutral-900 transition-all duration-300 ease-out";

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-center border-b border-neutral-200 bg-white px-3">
      <button
        onClick={isBack ? onBack : onMenu}
        aria-label={isBack ? "뒤로가기" : "메뉴 열기"}
        className="relative h-11 w-11 rounded-full active:bg-neutral-100 transition-colors"
      >
        <span className="absolute left-1/2 top-1/2 block h-6 w-6 -translate-x-1/2 -translate-y-1/2">
          <span
            className={`${line} ${isBack ? "w-3" : "w-5"}`}
            style={{
              transform: isBack
                ? "translateY(0) rotate(-45deg)"
                : "translateY(-6px) rotate(0deg)",
            }}
          />
          <span className={`${line} w-5`} />
          <span
            className={`${line} ${isBack ? "w-3" : "w-5"}`}
            style={{
              transform: isBack
                ? "translateY(0) rotate(45deg)"
                : "translateY(6px) rotate(0deg)",
            }}
          />
        </span>
      </button>

      <h1 className="pointer-events-none absolute inset-x-16 truncate text-center text-base font-semibold text-neutral-900">
        {title}
      </h1>
    </header>
  );
}