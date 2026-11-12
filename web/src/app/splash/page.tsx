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
      <span className="san-ripples" style={{ ["--size" as string]: "96px" }}>
        <i />
        <i />
        <i />
      </span>
      <h1 className="san-eyebrow">SAN</h1>
    </main>
  );
}
