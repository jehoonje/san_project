"use client";

import { useEffect, useState } from "react";

export default function AuthBridgePage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const currentUrl = new URL(window.location.href);
      const destination = currentUrl.searchParams.get("to");

      if (!destination) {
        throw new Error("앱으로 돌아갈 주소가 없습니다.");
      }

      const callbackUrl = new URL(destination);

      currentUrl.searchParams.forEach((value, key) => {
        if (key === "to") return;
        callbackUrl.searchParams.set(key, value);
      });

      console.log("[BRIDGE] 앱 콜백 이동", {
        destination: callbackUrl.origin,
        hasCode: callbackUrl.searchParams.has("code"),
        hasError: callbackUrl.searchParams.has("error"),
      });

      window.location.replace(callbackUrl.toString());
    } catch (cause) {
      console.error("[BRIDGE] OAuth 브리지 오류", cause);

      setError(
        cause instanceof Error
          ? cause.message
          : "로그인 결과를 앱으로 전달하지 못했습니다.",
      );
    }
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-san-bg p-6 text-san-text">
      <section className="text-center">
        {error ? (
          <>
            <p className="san-eyebrow">SIGN IN</p>
            <h1 className="san-title mt-2">연결이 닿지 않았어요</h1>
            <p
              role="alert"
              className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-san-error"
            >
              {error}
            </p>
          </>
        ) : (
          <>
            <span className="san-ripples mx-auto" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p className="mt-5 text-[13px] text-san-text">앱으로 돌아가는 중</p>
          </>
        )}
      </section>
    </main>
  );
}
