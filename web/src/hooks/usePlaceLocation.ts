"use client";

import { useCallback, useEffect, useRef } from "react";

export type PlaceLocationResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      accuracy: number | null;
    }
  | {
      ok: false;
      message: string;
    };

type NativeWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

type PendingRequest = {
  finish: (result: PlaceLocationResult) => void;
};

// 모바일의 15초 타임아웃 응답을 받을 여유를 둡니다.
const TIMEOUT_MS = 20_000;

function isValidLocation(
  lat: unknown,
  lng: unknown,
): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function browserErrorMessage(
  error: GeolocationPositionError,
): string {
  switch (error.code) {
    case 1:
      return "위치 권한이 필요해요. 브라우저 설정에서 위치 접근을 허용해 주세요.";
    case 2:
      return "현재 위치를 확인하지 못했어요. 위치 서비스와 GPS 설정을 확인해 주세요.";
    case 3:
      return "위치 확인 시간이 초과됐어요. 다시 시도해 주세요.";
    default:
      return "현재 위치를 가져오지 못했어요.";
  }
}

export function usePlaceLocation() {
  const pendingRef = useRef(
    new Map<string, PendingRequest>(),
  );

  useEffect(() => {
    const pending = pendingRef.current;

    function onMessage(event: Event) {
      const raw = (event as MessageEvent<unknown>).data;

      if (typeof raw !== "string") return;

      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      if (
        !parsed ||
        typeof parsed !== "object"
      ) {
        return;
      }

      const data = parsed as Record<string, unknown>;

      if (typeof data.requestId !== "string") return;

      const request = pending.get(data.requestId);

      if (!request) return;

      if (data.type === "PLACE_LOCATION") {
        if (!isValidLocation(data.lat, data.lng)) {
          request.finish({
            ok: false,
            message: "앱에서 전달한 위치 정보가 올바르지 않아요.",
          });
          return;
        }

        request.finish({
          ok: true,
          lat: data.lat as number,
          lng: data.lng as number,
          accuracy:
            typeof data.accuracy === "number" &&
            Number.isFinite(data.accuracy)
              ? data.accuracy
              : null,
        });
      } else if (data.type === "PLACE_LOCATION_ERROR") {
        request.finish({
          ok: false,
          message:
            typeof data.message === "string"
              ? data.message
              : "현재 위치를 가져오지 못했어요.",
        });
      }
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);

      for (const request of Array.from(pending.values())) {
        request.finish({
          ok: false,
          message: "위치 요청이 취소됐어요.",
        });
      }
    };
  }, []);

  const requestLocation = useCallback(
    (): Promise<PlaceLocationResult> =>
      new Promise((resolve) => {
        const requestId =
          `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const pending = pendingRef.current;

        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const finish = (result: PlaceLocationResult) => {
          if (settled) return;

          settled = true;

          if (timer !== undefined) {
            clearTimeout(timer);
          }

          pending.delete(requestId);
          resolve(result);
        };

        pending.set(requestId, { finish });

        timer = setTimeout(() => {
          finish({
            ok: false,
            message:
              "위치 확인 시간이 초과됐어요. 위치 권한과 GPS 설정을 확인한 뒤 다시 시도해 주세요.",
          });
        }, TIMEOUT_MS);

        const bridge =
          (window as NativeWindow).ReactNativeWebView;

        if (bridge && typeof bridge.postMessage === "function") {
          try {
            console.log(
              "[WEB] PLACE_LOCATION_REQUEST:",
              requestId,
            );

            bridge.postMessage(
              JSON.stringify({
                type: "PLACE_LOCATION_REQUEST",
                requestId,
              }),
            );
          } catch (error) {
            console.error(
              "[WEB] 네이티브 위치 요청 실패:",
              error,
            );

            finish({
              ok: false,
              message: "앱으로 위치 요청을 전달하지 못했어요.",
            });
          }

          return;
        }

        if (!navigator.geolocation) {
          finish({
            ok: false,
            message: "이 브라우저는 위치 정보를 지원하지 않아요.",
          });
          return;
        }

        try {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude, accuracy } =
                position.coords;

              if (!isValidLocation(latitude, longitude)) {
                finish({
                  ok: false,
                  message: "올바른 위치 정보를 받지 못했어요.",
                });
                return;
              }

              finish({
                ok: true,
                lat: latitude,
                lng: longitude,
                accuracy: Number.isFinite(accuracy)
                  ? accuracy
                  : null,
              });
            },
            (error) => {
              finish({
                ok: false,
                message: browserErrorMessage(error),
              });
            },
            {
              enableHighAccuracy: true,
              timeout: 15_000,
              maximumAge: 10_000,
            },
          );
        } catch (error) {
          console.error(
            "[WEB] 브라우저 위치 요청 실패:",
            error,
          );

          finish({
            ok: false,
            message: "현재 위치를 요청하지 못했어요.",
          });
        }
      }),
    [],
  );

  return { requestLocation };
}