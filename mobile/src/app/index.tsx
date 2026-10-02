// mobile/src/app/index.tsx
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

// 프리뷰 테스트가 끝나면 운영 주소로 되돌린 뒤 커밋하세요.
const WEB_URL =
  "https://san-project-hdl1yu3du-jehoonjes-projects.vercel.app/splash";

type TrackingStatus = "idle" | "recording" | "paused";

type RecordedPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number | null;
};

export default function Index() {
  const webviewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<TrackingStatus>("idle");

  const recordedPointsRef = useRef<RecordedPoint[]>([]);
  const locationSubscriptionRef =
    useRef<Location.LocationSubscription | null>(null);

  const isStartingTrackingRef = useRef(false);
  const isWebReadyRef = useRef(false);
  const pendingInitialLocationRef = useRef<RecordedPoint | null>(null);
  const lastKnownPointRef = useRef<RecordedPoint | null>(null);

  const redirectUri = Linking.createURL("auth/callback");

  useEffect(() => {
    console.log("[APP] OAuth redirectUri:", redirectUri);
  }, [redirectUri]);

  useEffect(() => {
    return () => {
      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;
    };
  }, []);

  function sendToWeb(message: Record<string, unknown>) {
    webviewRef.current?.postMessage(JSON.stringify(message));
  }

  function coordsForWeb(): [number, number][] {
    return recordedPointsRef.current.map((point) => [
      point.lng,
      point.lat,
    ]);
  }

  function sendInitialLocation(point: RecordedPoint) {
    sendToWeb({
      type: "LOCATION_UPDATE",
      coords: [[point.lng, point.lat]],
    });

    setTimeout(() => {
      sendToWeb({
        type: "LOCATION_UPDATE",
        coords: [[point.lng, point.lat]],
      });
    }, 800);
  }

  async function showInitialLocation() {
    const permission =
      await Location.requestForegroundPermissionsAsync();

    console.log("[APP] 초기 위치 권한:", {
      status: permission.status,
      granted: permission.granted,
      iosScope: permission.ios?.scope,
      iosAccuracy: permission.ios?.accuracy,
      androidAccuracy: permission.android?.accuracy,
    });

    if (permission.status !== "granted") {
      return;
    }

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const point: RecordedPoint = {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        timestamp: current.timestamp,
        accuracy: current.coords.accuracy,
      };

      console.log("[APP] 초기 위치 조회:", point);

      lastKnownPointRef.current = point;

      if (isWebReadyRef.current) {
        sendInitialLocation(point);
      } else {
        pendingInitialLocationRef.current = point;
      }
    } catch (error) {
      console.warn("[APP] 초기 위치 조회 실패:", error);
    }
  }

  useEffect(() => {
    showInitialLocation();
  }, []);

  function handleWebViewLoadEnd() {
    isWebReadyRef.current = true;

    setTimeout(() => {
      const pending = pendingInitialLocationRef.current;

      if (pending) {
        sendInitialLocation(pending);
        pendingInitialLocationRef.current = null;
      }
    }, 500);
  }

  function handleWebReady() {
    if (lastKnownPointRef.current) {
      sendInitialLocation(lastKnownPointRef.current);
      return;
    }

    showInitialLocation();
  }

  async function handlePlaceLocationRequest(requestId: string) {
    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        sendToWeb({
          type: "PLACE_LOCATION_ERROR",
          requestId,
          message: "위치 권한이 필요합니다.",
        });
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      console.log("[APP] 장소 저장용 위치 조회:", current.coords);

      sendToWeb({
        type: "PLACE_LOCATION",
        requestId,
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        accuracy: current.coords.accuracy,
      });
    } catch (error) {
      console.warn("[APP] 장소 저장용 위치 조회 실패:", error);

      sendToWeb({
        type: "PLACE_LOCATION_ERROR",
        requestId,
        message: "현재 위치를 가져오지 못했습니다.",
      });
    }
  }

  async function startOAuth(url: string) {
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        redirectUri
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
      console.log("[APP] 이미 위치 기록을 시작했거나 시작 중입니다.");
      return;
    }

    isStartingTrackingRef.current = true;

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      console.log("[APP] 기록 위치 권한:", {
        status: permission.status,
        granted: permission.granted,
        iosScope: permission.ios?.scope,
        iosAccuracy: permission.ios?.accuracy,
        androidAccuracy: permission.android?.accuracy,
      });

      if (permission.status !== "granted") {
        Alert.alert(
          "위치 권한 필요",
          "경로를 기록하려면 위치 권한을 허용해야 합니다."
        );

        setStatus("idle");

        sendToWeb({
          type: "STATUS_ACK",
          status: "idle",
        });

        return;
      }

      if (permission.ios?.accuracy === "reduced") {
        Alert.alert(
          "정확한 위치 필요",
          "설정에서 Expo Go의 '정확한 위치'를 켜야 이동 경로를 제대로 기록할 수 있습니다."
        );
      }

      const servicesEnabled =
        await Location.hasServicesEnabledAsync();

      console.log("[APP] 위치 서비스 활성화:", servicesEnabled);

      if (!servicesEnabled) {
        Alert.alert(
          "위치 서비스 꺼짐",
          "아이폰 설정에서 위치 서비스를 켜 주세요."
        );

        setStatus("idle");

        sendToWeb({
          type: "STATUS_ACK",
          status: "idle",
        });

        return;
      }

      setStatus("recording");

      sendToWeb({
        type: "STATUS_ACK",
        status: "recording",
      });

      /*
       * iOS에서는 timeInterval이 적용되지 않습니다.
       * distanceInterval을 0으로 두고 iOS가 제공하는 모든 위치 갱신을 받습니다.
       * GPS 노이즈 제거와 최소 이동 거리 필터링은 동작 확인 후 앱 코드에서 처리합니다.
       */
      locationSubscriptionRef.current =
        await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 0,
            timeInterval: 1000,
          },
          (location) => {
            const point: RecordedPoint = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: location.timestamp,
              accuracy: location.coords.accuracy,
            };

            recordedPointsRef.current.push(point);
            lastKnownPointRef.current = point;

            console.log(
              `[APP] 좌표 기록 #${recordedPointsRef.current.length}:`,
              {
                ...point,
                speed: location.coords.speed,
                heading: location.coords.heading,
              }
            );

            sendToWeb({
              type: "LOCATION_UPDATE",
              coords: coordsForWeb(),
            });
          },
          (reason) => {
            console.error("[APP] 위치 구독 오류:", reason);

            sendToWeb({
              type: "TRACKING_ERROR",
              message: reason,
            });
          }
        );

      console.log("[APP] 위치 구독 시작 완료");
    } catch (error) {
      console.error("[APP] 위치 기록 시작 실패:", error);

      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;

      setStatus("idle");

      sendToWeb({
        type: "STATUS_ACK",
        status: "idle",
      });

      Alert.alert(
        "위치 기록 오류",
        "위치 기록을 시작하지 못했습니다."
      );
    } finally {
      isStartingTrackingRef.current = false;
    }
  }

  function pauseTracking() {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;

    setStatus("paused");

    sendToWeb({
      type: "STATUS_ACK",
      status: "paused",
    });

    console.log(
      "[APP] 위치 기록 일시정지:",
      recordedPointsRef.current.length
    );
  }

  function stopTracking() {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    isStartingTrackingRef.current = false;

    setStatus("idle");

    sendToWeb({
      type: "STATUS_ACK",
      status: "idle",
    });

    console.log(
      "[APP] 최종 기록된 좌표 개수:",
      recordedPointsRef.current.length
    );

    console.log(
      "[APP] 전체 기록:",
      recordedPointsRef.current
    );

    recordedPointsRef.current = [];
  }

  function handleWebMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      console.log("[APP] 웹에서 받은 메시지:", data);

      if (data.type === "START_TRACKING") {
        requestPermissionAndStart();
        return;
      }

      if (data.type === "PAUSE_TRACKING") {
        pauseTracking();
        return;
      }

      if (data.type === "STOP_TRACKING") {
        stopTracking();
        return;
      }

      if (data.type === "WEB_READY") {
        handleWebReady();
        return;
      }

      if (
        data.type === "PLACE_LOCATION_REQUEST" &&
        typeof data.requestId === "string"
      ) {
        handlePlaceLocationRequest(data.requestId);
        return;
      }

      if (
        data.type === "OAUTH_START" &&
        typeof data.url === "string"
      ) {
        startOAuth(data.url);
      }
    } catch (error) {
      console.error(
        "[APP] 메시지 파싱 실패:",
        error,
        event.nativeEvent.data
      );
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <WebView
        ref={webviewRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={`
          window.__NATIVE_REDIRECT_URI__ = ${JSON.stringify(
            redirectUri
          )};
          true;
        `}
        onMessage={handleWebMessage}
        onLoadEnd={handleWebViewLoadEnd}
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