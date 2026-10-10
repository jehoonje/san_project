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
    <main
      style={{
        display: "grid",
        minHeight: "100dvh",
        placeItems: "center",
        padding: "24px",
        color: "#f5f5f5",
        background: "#090a0c",
        fontFamily:
          "Pretendard Variable, Pretendard, system-ui, sans-serif",
      }}
    >
      <section style={{ textAlign: "center" }}>
        {error ? (
          <>
            <h1
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: 650,
              }}
            >
              로그인 연결 실패
            </h1>

            <p
              role="alert"
              style={{
                maxWidth: "320px",
                margin: "12px auto 0",
                color: "#ff9e9e",
                fontSize: "14px",
                lineHeight: 1.6,
              }}
            >
              {error}
            </p>
          </>
        ) : (
          <>
            <div
              aria-hidden="true"
              style={{
                width: "28px",
                height: "28px",
                margin: "0 auto",
                border: "2px solid rgb(255 255 255 / 18%)",
                borderTopColor: "#ffffff",
                borderRadius: "999px",
                animation: "oauth-spin 700ms linear infinite",
              }}
            />

            <p
              style={{
                margin: "16px 0 0",
                color: "rgb(255 255 255 / 70%)",
                fontSize: "14px",
              }}
            >
              앱으로 돌아가는 중
            </p>

            <style jsx>{`
              @keyframes oauth-spin {
                to {
                  transform: rotate(360deg);
                }
              }

              @media (prefers-reduced-motion: reduce) {
                div {
                  animation: none !important;
                }
              }
            `}</style>
          </>
        )}
      </section>
    </main>
  );
}