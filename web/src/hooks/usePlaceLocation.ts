// web/src/hooks/usePlaceLocation.ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import { getNativeRedirectUri, postToNative } from "@/lib/nativeBridge";

export type PlaceLocationResult =
  | { ok: true; lat: number; lng: number; accuracy: number | null }
  | { ok: false; message: string };

const TIMEOUT_MS = 15000;

type IncomingMessage = {
  type?: string;
  requestId?: string;
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  message?: string;
};

// 현재 좌표를 1회 요청: 앱(WebView)에서는 앱에 요청하고, 일반 브라우저에서는 브라우저 위치 API 사용
export function usePlaceLocation() {
  const pendingRef = useRef(
    new Map<string, (result: PlaceLocationResult) => void>()
  );

  useEffect(() => {
    const pending = pendingRef.current;

    function onMessage(event: Event) {
      const raw = (event as MessageEvent).data;
      if (typeof raw !== "string") return;

      let data: IncomingMessage;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (!data.requestId) return;

      const resolve = pending.get(data.requestId);
      if (!resolve) return;

      if (
        data.type === "PLACE_LOCATION" &&
        typeof data.lat === "number" &&
        typeof data.lng === "number"
      ) {
        pending.delete(data.requestId);
        resolve({
          ok: true,
          lat: data.lat,
          lng: data.lng,
          accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
        });
      } else if (data.type === "PLACE_LOCATION_ERROR") {
        pending.delete(data.requestId);
        resolve({
          ok: false,
          message: data.message ?? "현재 위치를 가져오지 못했습니다.",
        });
      }
    }

    // iOS는 window, Android는 document로 메시지가 도착
    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);
    };
  }, []);

  const requestLocation = useCallback(
    () =>
      new Promise<PlaceLocationResult>((resolve) => {
        const pending = pendingRef.current;
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const timer = setTimeout(() => {
          if (pending.delete(requestId)) {
            resolve({ ok: false, message: "위치 확인 시간이 초과되었습니다." });
          }
        }, TIMEOUT_MS);

        const done = (result: PlaceLocationResult) => {
          clearTimeout(timer);
          resolve(result);
        };

        // 앱 안(WebView)인지 판별: 앱이 주입한 값이 있으면 앱
        if (getNativeRedirectUri() !== null) {
          pending.set(requestId, done);
          postToNative({ type: "PLACE_LOCATION_REQUEST", requestId });
          return;
        }

        if (!navigator.geolocation) {
          done({
            ok: false,
            message: "이 브라우저는 위치 정보를 지원하지 않습니다.",
          });
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) =>
            done({
              ok: true,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          () => done({ ok: false, message: "위치 권한을 허용해 주세요." }),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }),
    []
  );

  return { requestLocation };
}