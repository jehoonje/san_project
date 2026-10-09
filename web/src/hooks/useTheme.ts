"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type SanTheme = "dark" | "light";

const THEME_STORAGE_KEY = "san-theme";

function isSanTheme(
  value: string | null,
): value is SanTheme {
  return value === "dark" || value === "light";
}

function getDocumentTheme(): SanTheme {
  if (typeof document === "undefined") {
    return "dark";
  }

  return document.documentElement.dataset.theme ===
    "light"
    ? "light"
    : "dark";
}

function applyTheme(theme: SanTheme) {
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector(
    'meta[name="theme-color"]',
  );

  themeColor?.setAttribute(
    "content",
    theme === "dark" ? "#080a0f" : "#f3f0ea",
  );

  window.dispatchEvent(
    new CustomEvent("san-theme-change", {
      detail: { theme },
    }),
  );
}

export function useTheme() {
  const [theme, setThemeState] =
    useState<SanTheme>("dark");

  const hasManualPreferenceRef =
    useRef(false);

  useEffect(() => {
    let savedTheme: string | null = null;

    try {
      savedTheme =
        window.localStorage.getItem(
          THEME_STORAGE_KEY,
        );
    } catch {
      savedTheme = null;
    }

    hasManualPreferenceRef.current =
      isSanTheme(savedTheme);

    const initialTheme = getDocumentTheme();

    setThemeState(initialTheme);
    applyTheme(initialTheme);

    const mediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)",
    );

    const handleSystemThemeChange = (
      event: MediaQueryListEvent,
    ) => {
      if (
        hasManualPreferenceRef.current
      ) {
        return;
      }

      const nextTheme: SanTheme =
        event.matches ? "dark" : "light";

      applyTheme(nextTheme);
      setThemeState(nextTheme);
    };

    mediaQuery.addEventListener(
      "change",
      handleSystemThemeChange,
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        handleSystemThemeChange,
      );
    };
  }, []);

  const setTheme = useCallback(
    (nextTheme: SanTheme) => {
      hasManualPreferenceRef.current = true;

      try {
        window.localStorage.setItem(
          THEME_STORAGE_KEY,
          nextTheme,
        );
      } catch {
        // 저장소를 사용할 수 없는 환경에서도
        // 현재 세션의 테마 변경은 유지합니다.
      }

      applyTheme(nextTheme);
      setThemeState(nextTheme);
    },
    [],
  );

  return {
    theme,
    setTheme,
  };
}