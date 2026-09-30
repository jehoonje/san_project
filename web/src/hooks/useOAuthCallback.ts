// web/src/hooks/useOAuthCallback.ts
"use client";

import { useEffect, useRef } from "react";
import { completeOAuthFromUrl } from "@/lib/oauth";

// 앱이 보내는 OAUTH_CALLBACK / OAUTH_CANCELED 메시지를 처리
export function useOAuthCallback(
  onSuccess: () => void,
  onError: (message: string) => void
) {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    function onMessage(event: Event) {
      const raw = (event as MessageEvent).data;
      if (typeof raw !== "string") return;

      let data: { type?: string; url?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === "OAUTH_CANCELED") {
        onError("로그인이 취소되었습니다.");
        return;
      }

      if (data.type !== "OAUTH_CALLBACK" || typeof data.url !== "string") {
        return;
      }

      if (handledRef.current === data.url) return;
      handledRef.current = data.url;

      completeOAuthFromUrl(data.url).then((message) => {
        if (message) onError(message);
        else onSuccess();
      });
    }

    // iOS는 window, Android는 document로 메시지가 도착
    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);
    };
  }, [onSuccess, onError]);
}