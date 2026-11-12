"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import BootIntroScreen from "@/components/BootIntroScreen";

/**
 * 서버 컴포넌트인 layout에서 BootIntroScreen을 쓰기 위한 클라이언트 래퍼.
 * 메인("/")은 지도 준비와 맞물린 자체 인트로를 재생하므로 여기서는 건너뜁니다.
 */
export default function BootGate() {
  const pathname = usePathname();
  const [done, setDone] = useState(false);

  if (done || pathname === "/") return null;
  return <BootIntroScreen mode="quick" onComplete={() => setDone(true)} />;
}
