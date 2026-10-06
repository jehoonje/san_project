import type {
  Metadata,
  Viewport,
} from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAN",
  description: "나의 경로와 장소 기록",
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}