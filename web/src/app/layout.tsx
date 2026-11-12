import type { Metadata, Viewport } from "next";
import { DevFlagBootstrap } from "@/components/DevFlagBootstrap";
import BootGate from "@/components/BootGate";
import "./globals.css";
import "@/styles/san-entry.css";


const themeBootScript = `
(function () {
  var root = document.documentElement;
  var theme = "light";
  try {
    var saved = window.localStorage.getItem("san-theme");
    if (saved === "dark" || saved === "light") {
      theme = saved;
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      theme = "dark";
    }
  } catch (e) {
    theme = "light";
  }
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#14120f" : "#fbf5ea");
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
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#fbf5ea" />
        <link
          rel="preload"
          href="/fonts/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* 영문·숫자는 Inter, 한글은 Pretendard */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap"
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