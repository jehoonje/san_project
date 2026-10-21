"use client";

import { useState } from "react";
import BootIntroScreen from "@/components/BootIntroScreen";

/**
 * 서버 컴포넌트인 layout에서 BootIntroScreen을 쓰기 위한 클라이언트 래퍼.
 * 앱을 열 때마다(새로고침/재진입 포함) 항상 재생되고, 끝나면 언마운트됩니다.
 */
export default function BootGate() {
  const [done, setDone] = useState(false);

  if (done) return null;
  return <BootIntroScreen onComplete={() => setDone(true)} />;
}