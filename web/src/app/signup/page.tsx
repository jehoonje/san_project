// web/src/app/signup/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { signInWithProvider, type SocialProvider } from "@/lib/oauth";
import { useSession } from "@/hooks/useSession";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { SocialButtons } from "@/components/SocialButtons";

export default function SignupPage() {
  const router = useRouter();
  const { session } = useSession();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);

    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { nickname: nickname.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // 이메일 인증을 켜 둔 경우 session이 없음 → 안내 후 로그인 화면으로
    if (data.session) {
      router.replace("/");
      return;
    }
    setNotice("인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.");
    setBusy(false);
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

  const inputClass =
    "w-full rounded-xl border border-neutral-200 px-4 py-3.5 text-[16px] text-neutral-900 outline-none focus:border-[#ff5a36]";

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-white px-6 py-10">
      <h1 className="text-2xl font-bold text-neutral-900">회원가입</h1>
      <p className="mt-1 text-sm text-neutral-500">
        이메일로 가입하거나 소셜 계정으로 시작하세요.
      </p>

      <form onSubmit={handleSignup} className="mt-8 flex flex-col gap-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
          maxLength={20}
          required
          className={inputClass}
        />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          required
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (6자 이상)"
          required
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="비밀번호 확인"
          required
          className={inputClass}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}
        {notice && <p className="text-sm text-green-600">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 w-full rounded-xl bg-[#ff5a36] py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "처리 중..." : "가입하기"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        또는
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <SocialButtons disabled={busy} onSelect={handleSocial} />

      <Link
        href="/login"
        className="mt-6 text-center text-sm text-neutral-500 underline"
      >
        이미 계정이 있어요
      </Link>
    </main>
  );
}