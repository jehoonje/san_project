"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPortal } from "@/components/auth/AuthPortal";
import { useNativeOAuth } from "@/hooks/useNativeOAuth";
import { useSession } from "@/hooks/useSession";
import {
  signInWithProvider,
  type SocialProvider,
} from "@/lib/oauth";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useSession();

  const handleAuthenticated = useCallback(() => {
    router.replace("/");
  }, [router]);

  // Expo 앱이 보내는 OAUTH_CALLBACK을 받아 세션을 만든다
  useNativeOAuth(handleAuthenticated);

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
      onAuthenticated={handleAuthenticated}
      onSocialLogin={handleSocialLogin}
    />
  );
}