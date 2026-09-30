// web/src/components/SocialButtons.tsx
"use client";

import type { SocialProvider } from "@/lib/oauth";

type SocialButtonsProps = {
  disabled: boolean;
  onSelect: (provider: SocialProvider) => void;
};

export function SocialButtons({ disabled, onSelect }: SocialButtonsProps) {
  const base =
    "w-full rounded-xl py-3.5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect("google")}
        className={`${base} border border-neutral-300 bg-white text-neutral-800`}
      >
        Google로 계속하기
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect("kakao")}
        className={`${base} bg-[#FEE500] text-[#191919]`}
      >
        카카오로 계속하기
      </button>
    </div>
  );
}