// mobile/src/app/index.tsx
import { useEffect, useRef, useState } from "react";
import { StyleSheet, SafeAreaView, Alert } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

const WEB_URL = "https://san-project-ovnnpsyaw-jehoonjes-projects.vercel.app/";

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
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  );
  const isWebReadyRef = useRef(false);
  const pendingInitialLocationRef = useRef<RecordedPoint | null>(null);
  const lastKnownPointRef = useRef<RecordedPoint | null>(null);

  // 소셜 로그인 후 앱으로 돌아올 주소 (Expo Go: exp://..., 정식 빌드: sanproject://...)
  const redirectUri = Linking.createURL("auth/callback");

  useEffect(() => {
    console.log("[APP] OAuth redirectUri:", redirectUri);
  }, [redirectUri]);

  function sendToWeb(message: Record<string, unknown>) {
    webviewRef.current?.postMessage(JSON.stringify(message));
  }

  function coordsForWeb(): [number, number][] {
    return recordedPointsRef.current.map((p) => [p.lng, p.lat]);
  }

  function sendInitialLocation(point: RecordedPoint) {
    // 웹 쪽 리스너가 늦게 붙는 경우를 대비해 즉시 1회 + 지연 후 1회 더 전송
    sendToWeb({ type: "LOCATION_UPDATE", coords: [[point.lng, point.lat]] });
    setTimeout(() => {
      sendToWeb({ type: "LOCATION_UPDATE", coords: [[point.lng, point.lat]] });
    }, 800);
  }

  // 앱 진입 시(추적 시작 전) 현재 위치를 1회 조회해 지도에 표시
  async function showInitialLocation() {
    const { status: permissionStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (permissionStatus !== "granted") {
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
    } catch (err) {
      console.warn("[APP] 초기 위치 조회 실패:", err);
    }
  }

  useEffect(() => {
    showInitialLocation();
  }, []);

  function handleWebViewLoadEnd() {
    isWebReadyRef.current = true;

    setTimeout(() => {
      if (pendingInitialLocationRef.current) {
        sendInitialLocation(pendingInitialLocationRef.current);
        pendingInitialLocationRef.current = null;
      }
    }, 500);
  }

  // 웹의 메인(지도) 화면이 열렸을 때: 스플래시/로그인을 거쳐 왔으므로 위치를 다시 전달
  function handleWebReady() {
    if (lastKnownPointRef.current) {
      sendInitialLocation(lastKnownPointRef.current);
    } else {
      showInitialLocation();
    }
  }

  // 소셜 로그인: 시스템 브라우저(ASWebAuthenticationSession)로 열고 결과 URL을 웹에 전달
  async function startOAuth(url: string) {
    try {
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      if (result.type === "success") {
        sendToWeb({ type: "OAUTH_CALLBACK", url: result.url });
      } else {
        sendToWeb({ type: "OAUTH_CANCELED" });
      }
    } catch (err) {
      console.error("[APP] OAuth 실패:", err);
      sendToWeb({ type: "OAUTH_CANCELED" });
    }
  }

  async function requestPermissionAndStart() {
    const { status: permissionStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (permissionStatus !== "granted") {
      Alert.alert(
        "위치 권한 필요",
        "경로를 기록하려면 위치 권한을 허용해야 합니다."
      );
      sendToWeb({ type: "STATUS_ACK", status: "idle" });
      return;
    }

    setStatus("recording");
    sendToWeb({ type: "STATUS_ACK", status: "recording" });

    locationSubscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
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
          point
        );

        sendToWeb({
          type: "LOCATION_UPDATE",
          coords: coordsForWeb(),
        });
      }
    );
  }

  function pauseTracking() {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    setStatus("paused");
    sendToWeb({ type: "STATUS_ACK", status: "paused" });
  }

  function stopTracking() {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    setStatus("idle");
    sendToWeb({ type: "STATUS_ACK", status: "idle" });

    console.log(
      "[APP] 최종 기록된 좌표 개수:",
      recordedPointsRef.current.length
    );
    console.log("[APP] 전체 기록:", recordedPointsRef.current);

    recordedPointsRef.current = [];
  }

  function handleWebMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log("[APP] 웹에서 받은 메시지:", data);

      if (data.type === "START_TRACKING") {
        requestPermissionAndStart();
      }

      if (data.type === "PAUSE_TRACKING") {
        pauseTracking();
      }

      if (data.type === "STOP_TRACKING") {
        stopTracking();
      }

      if (data.type === "WEB_READY") {
        handleWebReady();
      }

      if (data.type === "OAUTH_START" && typeof data.url === "string") {
        startOAuth(data.url);
      }
    } catch (err) {
      console.error("[APP] 메시지 파싱 실패:", err, event.nativeEvent.data);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScriptBeforeContentLoaded={`window.__NATIVE_REDIRECT_URI__ = ${JSON.stringify(
          redirectUri
        )}; true;`}
        onMessage={handleWebMessage}
        onLoadEnd={handleWebViewLoadEnd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});