// web/src/hooks/useNativeBridge.ts
import { useCallback, useEffect, useState } from "react";
import type { AppToWebMessage, WebToAppMessage } from "@/types/tracking";

function isReactNativeWebView() {
  return (
    typeof window !== "undefined" &&
    (window as any).ReactNativeWebView !== undefined
  );
}

export function useNativeBridge(
  onMessage: (data: AppToWebMessage) => void
) {
  const [lastMessage, setLastMessage] = useState<string>("아직 메시지 없음");

  const sendToApp = useCallback((message: WebToAppMessage) => {
    if (isReactNativeWebView()) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify(message));
    } else {
      console.log("[WEB→APP] (브라우저 단독 실행 중, 앱 없음)", message);
    }
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "string") {
        return;
      }
    
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
    
      const data = parsed as AppToWebMessage;
    
      setLastMessage(JSON.stringify(data));
      onMessage(data);
    }

    document.addEventListener("message", handleMessage as EventListener);
    window.addEventListener("message", handleMessage);

    return () => {
      document.removeEventListener("message", handleMessage as EventListener);
      window.removeEventListener("message", handleMessage);
    };
  }, [onMessage]);

  return { sendToApp, lastMessage };
}