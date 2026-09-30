// web/src/app/login/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { signInWithProvider, type SocialProvider } from "@/lib/oauth";
import { useSession } from "@/hooks/useSession";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { SocialButtons } from "@/components/SocialButtons";

export default function LoginPage() {
  const router = useRouter();
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  const handleOAuthSuccess = useCallback(() => {
    router.replace("/");
  }, [router]);

  const handleOAuthError = useCallback((message: string) => {
    setError(message);
    setBusy(false);
  }, []);

  useOAuthCallback(handleOAuthSuccess, handleOAuthError);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(
        error.message.includes("Invalid login credentials")
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : error.message
      );
      setBusy(false);
      return;
    }
    router.replace("/");
  }

  async function handleSocial(provider: SocialProvider) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await signInWithProvider(provider);
    if (message) {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-white px-6 py-10">
      <h1 className="text-2xl font-bold text-neutral-900">나만의 루트</h1>
      <p className="mt-1 text-sm text-neutral-500">로그인하고 시작하세요.</p>

      <form onSubmit={handleEmailLogin} className="mt-8 flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          required
          className="w-full rounded-xl border border-neutral-200 px-4 py-3.5 text-[16px] text-neutral-900 outline-none focus:border-[#ff5a36]"
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          required
          className="w-full rounded-xl border border-neutral-200 px-4 py-3.5 text-[16px] text-neutral-900 outline-none focus:border-[#ff5a36]"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 w-full rounded-xl bg-[#ff5a36] py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "처리 중..." : "로그인"}
        </button>
        <Link
          href="/signup"
          className="w-full rounded-xl bg-neutral-100 py-3.5 text-center text-[15px] font-semibold text-neutral-800 transition active:scale-[0.98]"
        >
          회원가입
        </Link>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        또는
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <SocialButtons disabled={busy} onSelect={handleSocial} />
    </main>
  );
}