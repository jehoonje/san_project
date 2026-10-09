"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPortal } from "@/components/auth/AuthPortal";
import { useSession } from "@/hooks/useSession";
import {
  signInWithProvider,
  type SocialProvider,
} from "@/lib/oauth";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  async function handleSocialLogin(
    provider: SocialProvider,
  ): Promise<string | null> {
    return signInWithProvider(provider);
  }

  if (loading || session) {
    return (
      <main
        className="san-auth-loading"
        aria-label="로그인 상태 확인 중"
      >
        <div className="san-auth-loading-mark">
          <span />
          <span />
          <span />
        </div>
      </main>
    );
  }

  return (
    <AuthPortal
      onAuthenticated={() => router.replace("/")}
      onSocialLogin={handleSocialLogin}
    />
  );
}