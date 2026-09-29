// web/src/components/SideDrawer.tsx
"use client";

type SideDrawerProps = {
  open: boolean;
  onClose: () => void;
};

// 임시 하단 슬라이드 드로어 (카테고리 추가 전 자리표시)
export function SideDrawer({ open, onClose }: SideDrawerProps) {
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
        <h2 className="text-base font-semibold text-neutral-900">카테고리</h2>
        <p className="mt-2 text-sm text-neutral-500">
          준비 중입니다. 추후 카테고리가 이곳에 추가됩니다.
        </p>
      </div>
    </div>
  );
}