// 로컬 웹(localhost) 개발 전용 위치 시뮬레이션 설정
// - isDevMockEnabled: "가짜 현재 위치"를 반환할지 (앱 WebView 안에서는 항상 false)
// - isDevPanelEnabled: 가상 이동 패널을 보여줄지 (앱 WebView에서도 플래그로 켤 수 있음)
// - 강제로 켜기: ?mock=1   끄기: ?mock=0
// - 앱(Expo) 프리뷰에서 패널 켜기: 배포 환경변수 NEXT_PUBLIC_DEV_WALK=1  또는  WebView URL 뒤에 ?mock=1
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

export function isDevPanelEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const flag = new URLSearchParams(window.location.search).get("mock");

  try {
    if (flag === "1") window.localStorage.setItem("san-dev-walk", "1");
    if (flag === "0") window.localStorage.removeItem("san-dev-walk");
  } catch {
    /* 저장소 접근 불가 시 무시 */
  }

  if (flag === "0") return false;
  if (flag === "1") return true;
  if (process.env.NEXT_PUBLIC_DEV_WALK === "1") return true;

  try {
    if (window.localStorage.getItem("san-dev-walk") === "1") return true;
  } catch {
    /* 무시 */
  }

  return isDevMockEnabled();
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