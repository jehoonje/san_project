import type { Metadata, Viewport } from "next";
import { DevFlagBootstrap } from "@/components/DevFlagBootstrap";
import BootGate from "@/components/BootGate";
import "./globals.css";
import "@/styles/san-entry.css";


const themeBootScript = `
(function () {
  var root = document.documentElement;
  var theme = "dark";
  try {
    var saved = window.localStorage.getItem("san-theme");
    if (saved === "dark" || saved === "light") {
      theme = saved;
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      theme = "light";
    }
  } catch (e) {
    theme = "dark";
  }
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0d0b10" : "#f3ece7");
})();
`;


export const metadata: Metadata = {
  title: "SAN",
  description: "나의 경로와 장소 기록",
  formatDetection: { telephone: false, address: false, email: false },
};


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};


export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content="#0d0b10" />
        <link
          rel="preload"
          href="/fonts/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* BootIntroScreen의 "TIMSHEL" 파티클 샘플링용 Cinzel (해당 글자만 로드) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&text=TIMSHEL&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      {/* 브라우저 확장(ColorZilla의 cz-shortcut-listen 등)이 body 속성을 바꿔도 하이드레이션 경고가 나지 않게 함 */}
      <body suppressHydrationWarning>
        <DevFlagBootstrap />
        {children}
        <BootGate />
      </body>
    </html>
  );
}