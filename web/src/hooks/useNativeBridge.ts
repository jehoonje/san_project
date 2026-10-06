// web/src/hooks/useNativeBridge.ts
import { useCallback, useEffect } from "react";
import type { AppToWebMessage, WebToAppMessage } from "@/types/tracking";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

function getNativeWebView() {
  if (typeof window === "undefined") return null;
  return window.ReactNativeWebView ?? null;
}

export function useNativeBridge(
  onMessage: (data: AppToWebMessage) => void,
) {
  const sendToApp = useCallback((message: WebToAppMessage) => {
    const nativeWebView = getNativeWebView();

    if (nativeWebView) {
      nativeWebView.postMessage(JSON.stringify(message));
    } else {
      console.log("[WEB→APP] (브라우저 단독 실행 중, 앱 없음)", message);
    }
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "string") return;

      let parsed: unknown;

      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("type" in parsed) ||
        typeof parsed.type !== "string"
      ) {
        return;
      }

      onMessage(parsed as AppToWebMessage);
    }

    document.addEventListener("message", handleMessage as EventListener);
    window.addEventListener("message", handleMessage);

    return () => {
      document.removeEventListener("message", handleMessage as EventListener);
      window.removeEventListener("message", handleMessage);
    };
  }, [onMessage]);

  return { sendToApp };
}