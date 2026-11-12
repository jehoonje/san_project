// web/src/lib/themeTokens.ts
// 캔버스·WebGL·지도처럼 CSS가 닿지 않는 곳에서 --san-* 토큰을 읽어 쓰기 위한 도우미.
// (색 값은 globals.css 한 곳에만 둡니다.)

export type SanThemeName = "light" | "dark";

export function currentTheme(): SanThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** --san-* 토큰의 현재 값. 서버나 토큰이 없을 때는 fallback */
export function readToken(name: string, fallback = "#000000"): string {
  if (typeof window === "undefined") return fallback;
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** 테마가 바뀔 때마다 호출. 반환된 함수로 해제 */
export function onThemeChange(listener: (theme: SanThemeName) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    // 속성 변경 직후의 계산된 스타일을 읽도록 한 프레임 미룸
    requestAnimationFrame(() => listener(currentTheme()));
  };
  window.addEventListener("san-theme-change", handler);
  return () => window.removeEventListener("san-theme-change", handler);
}

/** "#rrggbb" → [r, g, b] (0~1). 셰이더 유니폼용 */
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  return [
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
  ];
}
