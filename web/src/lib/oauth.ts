// web/src/lib/oauth.ts
import { supabase } from "@/lib/supabaseClient";
import { getNativeRedirectUri, postToNative } from "@/lib/nativeBridge";

export type SocialProvider = "google" | "kakao";

// 성공하면 null, 실패하면 에러 메시지 반환
export async function signInWithProvider(
  provider: SocialProvider
): Promise<string | null> {
  const nativeRedirect = getNativeRedirectUri();

  // 앱(WebView) 안: 웹의 https 중계 페이지로 돌아오게 하고, 중계 페이지가 앱 주소로 넘긴다
  if (nativeRedirect) {
    const bridgeUrl = `${window.location.origin}/auth/bridge?to=${encodeURIComponent(
      nativeRedirect
    )}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: bridgeUrl, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      return error?.message ?? "로그인 주소를 만들지 못했습니다.";
    }
    postToNative({ type: "OAUTH_START", url: data.url });
    return null;
  }

  // 일반 브라우저: 그대로 리다이렉트
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/` },
  });
  return error ? error.message : null;
}

// 앱이 돌려준 콜백 URL로 세션 완성 (PKCE code 또는 토큰 fragment)
export async function completeOAuthFromUrl(
  url: string
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "로그인 응답을 해석하지 못했습니다.";
  }

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const errorDesc =
    parsed.searchParams.get("error_description") ??
    hashParams.get("error_description");
  if (errorDesc) return errorDesc;

  const code = parsed.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? error.message : null;
  }

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error ? error.message : null;
  }

  return "인증 정보를 받지 못했습니다.";
}