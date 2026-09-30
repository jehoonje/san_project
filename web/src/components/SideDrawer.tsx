// web/src/components/SideDrawer.tsx
"use client";

import { Avatar } from "@/components/Avatar";
import { useProfile } from "@/hooks/useProfile";

type SideDrawerProps = {
  open: boolean;
  email?: string | null;
  onClose: () => void;
  onLogout: () => void;
};

// 임시 하단 슬라이드 드로어 (카테고리 추가 전 자리표시)
export function SideDrawer({ open, email, onClose, onLogout }: SideDrawerProps) {
  const profile = useProfile();
  const displayName = profile?.displayName ?? "러너";
  const emailText = profile?.email ?? email ?? "이메일 정보 없음";

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-6 pb-10 pt-3 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-neutral-300" />

        <div className="flex items-center gap-3">
          <Avatar url={profile?.avatarUrl ?? null} name={displayName} size={48} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-neutral-900">
              {displayName}
            </p>
            <p className="truncate text-sm text-neutral-500">{emailText}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4">
          <h2 className="text-base font-semibold text-neutral-900">카테고리</h2>
          <p className="mt-2 text-sm text-neutral-500">
            준비 중입니다. 추후 카테고리가 이곳에 추가됩니다.
          </p>
        </div>

        <button
          onClick={onLogout}
          className="mt-6 w-full rounded-xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-800 active:scale-[0.98] transition"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}