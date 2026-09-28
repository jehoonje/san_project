import { useRef, useState } from "react";
import { StyleSheet, SafeAreaView } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

type TrackingStatus = "idle" | "recording" | "paused";

const baseRoute: [number, number][] = [
  [126.978, 37.5665],
  [126.9786, 37.5667],
  [126.9791, 37.5672],
  [126.9798, 37.5676],
  [126.9805, 37.568],
];

export default function Index() {
  const webviewRef = useRef<WebView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<TrackingStatus>("idle");

  function sendToWeb(message: Record<string, unknown>) {
    webviewRef.current?.postMessage(JSON.stringify(message));
  }

  function startDummyLocationUpdates() {
    let step = 0;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      step += 1;
      const extended = baseRoute.slice(
        0,
        Math.min(baseRoute.length, 1 + step)
      );

      sendToWeb({
        type: "LOCATION_UPDATE",
        coords: extended,
      });

      if (step >= baseRoute.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 1000);
  }

  function stopDummyLocationUpdates() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function handleWebMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log("[APP] 웹에서 받은 메시지:", data);

      if (data.type === "START_TRACKING") {
        setStatus("recording");
        sendToWeb({ type: "STATUS_ACK", status: "recording" });
        startDummyLocationUpdates();
      }

      if (data.type === "PAUSE_TRACKING") {
        setStatus("paused");
        sendToWeb({ type: "STATUS_ACK", status: "paused" });
        stopDummyLocationUpdates();
      }

      if (data.type === "STOP_TRACKING") {
        setStatus("idle");
        sendToWeb({ type: "STATUS_ACK", status: "idle" });
        stopDummyLocationUpdates();
      }
    } catch (err) {
      console.error("[APP] 메시지 파싱 실패:", err, event.nativeEvent.data);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: "https://san-project-phi.vercel.app" }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleWebMessage}
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