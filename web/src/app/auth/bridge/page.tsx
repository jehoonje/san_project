// web/src/app/auth/bridge/page.tsx
"use client";

import { useEffect } from "react";

// 앱 스킴으로만 넘기도록 제한 (오픈 리다이렉트 방지)
const ALLOWED_SCHEME = /^(exp|exps|sanproject):\/\//;

function buildTarget(): string | null {
  const params = new URLSearchParams(window.location.search);
  const to = params.get("to");
  if (!to || !ALLOWED_SCHEME.test(to)) return null;

  params.delete("to");
  const rest = params.toString();
  if (!rest) return to;
  return `${to}${to.includes("?") ? "&" : "?"}${rest}`;
}

export default function AuthBridgePage() {
  useEffect(() => {
    const target = buildTarget();
    if (target) window.location.replace(target);
  }, []);

  function handleOpenApp() {
    const target = buildTarget();
    if (target) window.location.href = target;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-[#ff5a36]" />
      <p className="text-sm text-neutral-500">앱으로 돌아가는 중...</p>
      <button
        onClick={handleOpenApp}
        className="rounded-xl bg-[#ff5a36] px-5 py-3 text-sm font-semibold text-white active:scale-95 transition"
      >
        앱으로 돌아가기
      </button>
    </main>
  );
}