// web/src/lib/nativeBridge.ts
type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  __NATIVE_REDIRECT_URI__?: string;
};

export function getNativeRedirectUri(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as NativeWindow;
  return w.ReactNativeWebView && w.__NATIVE_REDIRECT_URI__
    ? w.__NATIVE_REDIRECT_URI__
    : null;
}

export function postToNative(message: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  (window as NativeWindow).ReactNativeWebView?.postMessage(
    JSON.stringify(message)
  );
}