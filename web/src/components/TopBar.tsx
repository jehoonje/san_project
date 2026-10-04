"use client";

type TopBarProps = {
  title: string;
  isBack: boolean;
  onMenu: () => void;
  onBack: () => void;
  rightAction?: {
    label: string;
    onClick: () => void;
  } | null;
};

function AnalysisIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V3" />
    </svg>
  );
}

export function TopBar({
  title,
  isBack,
  onMenu,
  onBack,
  rightAction = null,
}: TopBarProps) {
  const line =
    "absolute left-[2px] top-1/2 -mt-px h-0.5 origin-left rounded-full bg-neutral-900 transition-all duration-300 ease-out";

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-center border-b border-neutral-200 bg-white px-3">
      <button
        onClick={isBack ? onBack : onMenu}
        aria-label={isBack ? "뒤로가기" : "메뉴 열기"}
        className="relative h-11 w-11 rounded-full transition-colors active:bg-neutral-100"
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

      {rightAction && !isBack && (
        <button
          onClick={rightAction.onClick}
          aria-label={rightAction.label}
          title={rightAction.label}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-colors active:bg-neutral-100"
        >
          <AnalysisIcon />
        </button>
      )}
    </header>
  );
}
