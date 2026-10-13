// 로컬 웹(localhost) 개발 전용 위치 시뮬레이션 설정
// - 앱(Expo Go) WebView 안에서는 항상 비활성화됩니다.
// - 강제로 켜기: ?mock=1   끄기: ?mock=0
// - 시작 좌표 지정: ?lat=37.5665&lng=126.978  또는 NEXT_PUBLIC_MOCK_LAT / NEXT_PUBLIC_MOCK_LNG

const DEFAULT_MOCK: [number, number] = [126.978, 37.5665]; // [lng, lat] 서울시청

let currentMock: [number, number] | null = null;

export function isDevMockEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const w = window as Window & { ReactNativeWebView?: unknown };
  if (w.ReactNativeWebView) return false;

  const flag = new URLSearchParams(window.location.search).get("mock");
  if (flag === "0") return false;
  if (flag === "1") return true;

  if (process.env.NODE_ENV === "production") return false;

  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host)
  );
}

export function getMockStart(): [number, number] {
  if (typeof window === "undefined") return DEFAULT_MOCK;

  const q = new URLSearchParams(window.location.search);
  const qLat = q.get("lat");
  const qLng = q.get("lng");
  const lat = Number(qLat ?? process.env.NEXT_PUBLIC_MOCK_LAT);
  const lng = Number(qLng ?? process.env.NEXT_PUBLIC_MOCK_LNG);

  if (
    (qLat !== null || process.env.NEXT_PUBLIC_MOCK_LAT) &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return [lng, lat];
  }

  return DEFAULT_MOCK;
}

/** 가상 이동으로 갱신되는 "현재 위치". 장소 저장 등 requestLocation 결과에 사용됩니다. */
export function setMockCurrent(coord: [number, number]) {
  currentMock = coord;
}

export function getMockCurrent(): [number, number] {
  return currentMock ?? getMockStart();
}