import { useEffect, useRef } from "react";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
} from "react-native-webview";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

// 프리뷰 테스트가 끝나면 운영 주소로 되돌린 뒤 커밋하세요.
const WEB_URL =
  "https://san-project-aglf1worc-jehoonjes-projects.vercel.app/";

const LOCATION_TIMEOUT_MS = 15_000;

type TrackingStatus = "idle" | "recording" | "paused";

type RecordedPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number | null;
};

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "현재 위치를 가져오지 못했어요.";
}

function toRecordedPoint(
  location: Location.LocationObject,
): RecordedPoint {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    timestamp: location.timestamp,
    accuracy: location.coords.accuracy,
  };
}

async function ensureLocationPermission() {
  const existing =
    await Location.getForegroundPermissionsAsync();

  const permission =
    existing.status === "granted" || !existing.canAskAgain
      ? existing
      : await Location.requestForegroundPermissionsAsync();

  if (permission.status !== "granted") {
    throw new Error(
      "위치 권한이 필요해요. 휴대폰 설정에서 앱의 위치 권한을 허용해 주세요.",
    );
  }

  const servicesEnabled =
    await Location.hasServicesEnabledAsync();

  if (!servicesEnabled) {
    throw new Error(
      "위치 서비스가 꺼져 있어요. 휴대폰 설정에서 위치 서비스를 켜 주세요.",
    );
  }

  return permission;
}

async function getDeviceLocation(
  accuracy: Location.Accuracy,
): Promise<Location.LocationObject> {
  return withTimeout(
    (async () => {
      await ensureLocationPermission();

      console.log("[APP] GPS 조회 시작");

      const location =
        await Location.getCurrentPositionAsync({
          accuracy,
        });

      console.log(
        "[APP] GPS 조회 성공:",
        location.coords,
      );

      return location;
    })(),
    LOCATION_TIMEOUT_MS,
    "현재 위치 확인이 지연되고 있어요. 위치 권한과 GPS 설정을 확인한 뒤 다시 시도해 주세요.",
  );
}

export default function Index() {
  const webviewRef = useRef<WebView>(null);
  const mountedRef = useRef(true);

  const statusRef = useRef<TrackingStatus>("idle");
  const recordedPointsRef = useRef<RecordedPoint[]>([]);

  const locationSubscriptionRef =
    useRef<Location.LocationSubscription | null>(null);

  const isStartingTrackingRef = useRef(false);
  const trackingGenerationRef = useRef(0);

  const isWebReadyRef = useRef(false);
  const lastKnownPointRef = useRef<RecordedPoint | null>(
    null,
  );

  const pendingInitialLocationRef =
    useRef<RecordedPoint | null>(null);

  const pendingInitialErrorRef = useRef<string | null>(
    null,
  );

  const initialLocationPromiseRef =
    useRef<Promise<void> | null>(null);

  const redirectUri = Linking.createURL("auth/callback");

  useEffect(() => {
    console.log("[APP] OAuth redirectUri:", redirectUri);
  }, [redirectUri]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      trackingGenerationRef.current += 1;

      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;
    };
  }, []);

  function sendToWeb(message: Record<string, unknown>) {
    if (!mountedRef.current) return;

    webviewRef.current?.postMessage(
      JSON.stringify(message),
    );
  }

  function coordsForWeb(): [number, number][] {
    return recordedPointsRef.current.map((point) => [
      point.lng,
      point.lat,
    ]);
  }

  function acknowledgeStatus(next: TrackingStatus) {
    statusRef.current = next;

    sendToWeb({
      type: "STATUS_ACK",
      status: next,
    });
  }

  function sendInitialLocation(point: RecordedPoint) {
    // 初期位置で記録中の経路を上書きしない
    const coords =
      recordedPointsRef.current.length > 0
        ? coordsForWeb()
        : [[point.lng, point.lat]];

    sendToWeb({
      type: "LOCATION_UPDATE",
      coords,
    });
  }

  function showInitialLocation(): Promise<void> {
    if (initialLocationPromiseRef.current) {
      return initialLocationPromiseRef.current;
    }

    const task = (async () => {
      try {
        const location = await getDeviceLocation(
          Location.Accuracy.Balanced,
        );

        if (!mountedRef.current) return;

        const point = toRecordedPoint(location);

        lastKnownPointRef.current = point;
        pendingInitialErrorRef.current = null;

        if (isWebReadyRef.current) {
          sendInitialLocation(point);
        } else {
          pendingInitialLocationRef.current = point;
        }
      } catch (error) {
        if (!mountedRef.current) return;

        const message = getErrorMessage(error);

        console.warn(
          "[APP] 초기 위치 조회 실패:",
          message,
        );

        pendingInitialErrorRef.current = message;

        if (isWebReadyRef.current) {
          sendToWeb({
            type: "INITIAL_LOCATION_ERROR",
            message,
          });

          pendingInitialErrorRef.current = null;
        }
      }
    })();

    initialLocationPromiseRef.current = task;

    void task.finally(() => {
      if (initialLocationPromiseRef.current === task) {
        initialLocationPromiseRef.current = null;
      }
    });

    return task;
  }

  // 초기 위치는 웹이 WEB_READY를 보낸 뒤 요청한다.
  function handleWebReady() {
    console.log("[APP] WEB_READY 수신");

    isWebReadyRef.current = true;

    sendToWeb({
      type: "STATUS_ACK",
      status: statusRef.current,
    });

    const point =
      pendingInitialLocationRef.current ??
      lastKnownPointRef.current;

    if (point) {
      pendingInitialLocationRef.current = null;
      sendInitialLocation(point);
      return;
    }

    const pendingError = pendingInitialErrorRef.current;

    if (pendingError) {
      pendingInitialErrorRef.current = null;

      sendToWeb({
        type: "INITIAL_LOCATION_ERROR",
        message: pendingError,
      });
    }

    void showInitialLocation();
  }

  async function handlePlaceLocationRequest(
    requestId: string,
  ) {
    console.log(
      "[APP] 장소 위치 요청 수신:",
      requestId,
    );

    try {
      const location = await getDeviceLocation(
        Location.Accuracy.High,
      );

      if (!mountedRef.current) return;

      lastKnownPointRef.current =
        toRecordedPoint(location);

      console.log(
        "[APP] PLACE_LOCATION 전송:",
        requestId,
      );

      sendToWeb({
        type: "PLACE_LOCATION",
        requestId,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      console.warn(
        "[APP] PLACE_LOCATION_ERROR:",
        requestId,
        message,
      );

      sendToWeb({
        type: "PLACE_LOCATION_ERROR",
        requestId,
        message,
      });
    }
  }

  async function startOAuth(url: string) {
    try {
      const result =
        await WebBrowser.openAuthSessionAsync(
          url,
          redirectUri,
        );

      if (result.type === "success") {
        sendToWeb({
          type: "OAUTH_CALLBACK",
          url: result.url,
        });
      } else {
        sendToWeb({
          type: "OAUTH_CANCELED",
        });
      }
    } catch (error) {
      console.error("[APP] OAuth 실패:", error);

      sendToWeb({
        type: "OAUTH_CANCELED",
      });
    }
  }

  async function requestPermissionAndStart() {
    if (
      isStartingTrackingRef.current ||
      locationSubscriptionRef.current
    ) {
      console.log(
        "[APP] 위치 기록이 이미 시작됐거나 시작 중입니다.",
      );
      return;
    }

    isStartingTrackingRef.current = true;

    const generation =
      ++trackingGenerationRef.current;

    const previousStatus = statusRef.current;

    try {
      const permission = await withTimeout(
        ensureLocationPermission(),
        LOCATION_TIMEOUT_MS,
        "위치 권한 확인이 지연되고 있어요. 다시 시도해 주세요.",
      );

      if (
        !mountedRef.current ||
        generation !== trackingGenerationRef.current
      ) {
        return;
      }

      if (permission.ios?.accuracy === "reduced") {
        Alert.alert(
          "정확한 위치 필요",
          "휴대폰 설정에서 이 앱의 '정확한 위치'를 켜 주세요.",
        );
      }

      const subscription =
        await Location.watchPositionAsync(
          {
            accuracy:
              Location.Accuracy.BestForNavigation,
            distanceInterval: 0,
            timeInterval: 1000,
          },
          (location) => {
            if (
              !mountedRef.current ||
              generation !==
                trackingGenerationRef.current
            ) {
              return;
            }

            const point = toRecordedPoint(location);

            recordedPointsRef.current.push(point);
            lastKnownPointRef.current = point;

            console.log(
              `[APP] 좌표 기록 #${recordedPointsRef.current.length}:`,
              point,
            );

            sendToWeb({
              type: "LOCATION_UPDATE",
              coords: coordsForWeb(),
            });
          },
          (reason) => {
            if (
              !mountedRef.current ||
              generation !==
                trackingGenerationRef.current
            ) {
              return;
            }

            console.error(
              "[APP] 위치 구독 오류:",
              reason,
            );

            sendToWeb({
              type: "TRACKING_ERROR",
              message: reason,
            });
          },
        );

      // 구독 생성 중 사용자가 일시정지/종료한 경우 해제한다.
      if (
        !mountedRef.current ||
        generation !== trackingGenerationRef.current
      ) {
        subscription.remove();
        return;
      }

      locationSubscriptionRef.current = subscription;

      acknowledgeStatus("recording");

      console.log("[APP] 위치 구독 시작 완료");
    } catch (error) {
      if (
        !mountedRef.current ||
        generation !== trackingGenerationRef.current
      ) {
        return;
      }

      console.error(
        "[APP] 위치 기록 시작 실패:",
        error,
      );

      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;

      acknowledgeStatus(
        previousStatus === "paused" ? "paused" : "idle",
      );

      const message = getErrorMessage(error);

      sendToWeb({
        type: "TRACKING_ERROR",
        message,
      });

      Alert.alert("위치 기록 오류", message);
    } finally {
      if (generation === trackingGenerationRef.current) {
        isStartingTrackingRef.current = false;
      }
    }
  }

  function pauseTracking() {
    trackingGenerationRef.current += 1;
    isStartingTrackingRef.current = false;

    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;

    acknowledgeStatus("paused");

    console.log(
      "[APP] 위치 기록 일시정지:",
      recordedPointsRef.current.length,
    );
  }

  function stopTracking() {
    trackingGenerationRef.current += 1;
    isStartingTrackingRef.current = false;

    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;

    acknowledgeStatus("idle");

    console.log(
      "[APP] 최종 기록된 좌표 개수:",
      recordedPointsRef.current.length,
    );

    recordedPointsRef.current = [];
  }

  function handleWebMessage(
    event: WebViewMessageEvent,
  ) {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (
        !data ||
        typeof data !== "object" ||
        typeof data.type !== "string"
      ) {
        return;
      }

      console.log(
        "[APP] 웹에서 받은 메시지:",
        data.type,
      );

      switch (data.type) {
        case "START_TRACKING":
          void requestPermissionAndStart();
          return;

        case "PAUSE_TRACKING":
          pauseTracking();
          return;

        case "STOP_TRACKING":
          stopTracking();
          return;

        case "WEB_READY":
          handleWebReady();
          return;

        case "PLACE_LOCATION_REQUEST":
          if (typeof data.requestId === "string") {
            void handlePlaceLocationRequest(
              data.requestId,
            );
          }
          return;

        case "OAUTH_START":
          if (typeof data.url === "string") {
            void startOAuth(data.url);
          }
          return;
      }
    } catch (error) {
      console.error(
        "[APP] 메시지 처리 실패:",
        error,
      );
    }
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "bottom"]}
    >
      <WebView
        ref={webviewRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={`
          window.__NATIVE_REDIRECT_URI__ =
            ${JSON.stringify(redirectUri)};
          true;
        `}
        onMessage={handleWebMessage}
        onLoadStart={() => {
          isWebReadyRef.current = false;
        }}
        onLoadEnd={() => {
          console.log(
            "[APP] WebView 로드 완료 — WEB_READY 대기",
          );
        }}
        onError={(event) => {
          console.warn(
            "[APP] WebView 로드 오류:",
            event.nativeEvent.description,
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webview: {
    flex: 1,
  },
});