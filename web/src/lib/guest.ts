// web/src/lib/guest.ts
// 게스트 모드: 로그인 없이 둘러보고 기록하기.
// 기록은 서버가 아니라 이 기기(localStorage)에만 남습니다.

const GUEST_FLAG_KEY = "san-guest";
const GUEST_ID_KEY = "san-guest-id";
const EVENT = "san-guest-change";

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function enterGuestMode() {
  try {
    window.localStorage.setItem(GUEST_FLAG_KEY, "1");
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 게스트로 동작
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function leaveGuestMode() {
  try {
    window.localStorage.removeItem(GUEST_FLAG_KEY);
  } catch {
    // 무시
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 이 기기의 게스트 식별자 (신호명·교차 로그 보관용. 서버로 보내지 않음) */
export function getGuestId(): string {
  try {
    const saved = window.localStorage.getItem(GUEST_ID_KEY);
    if (saved) return saved;
    const next = `guest-${crypto.randomUUID()}`;
    window.localStorage.setItem(GUEST_ID_KEY, next);
    return next;
  } catch {
    return "guest-local";
  }
}

export function onGuestChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
