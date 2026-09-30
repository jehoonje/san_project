// web/src/app/splash/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";

export default function SplashPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 1400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loading || !minDone) return;
    router.replace(session ? "/" : "/login");
  }, [loading, minDone, session, router]);

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#ff5a36]">
      <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-3xl bg-white/20 text-4xl">
        {"\u{1F4CD}"}
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-white">
        나만의 루트
      </h1>
      <p className="text-sm text-white/80">걷고, 기록하고, 다시 만나기</p>
    </main>
  );
}