// web/src/app/splash/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import { isGuestMode } from "@/lib/guest";

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
    router.replace(session || isGuestMode() ? "/" : "/login");
  }, [loading, minDone, session, router]);

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-san-bg text-san-text">
      <h1 className="san-t1">SAN</h1>
      <span className="san-ripples" aria-label="불러오는 중" style={{ ["--size" as string]: "40px" }}>
        <i />
        <i />
      </span>
    </main>
  );
}
