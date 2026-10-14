// components/DevFlagBootstrap.tsx
"use client";

import { useEffect } from "react";
import { isDevPanelEnabled } from "@/lib/devLocation";

export function DevFlagBootstrap() {
  useEffect(() => {
    isDevPanelEnabled(); // ?mock=1 / ?mock=0 을 localStorage에 저장
  }, []);

  return null;
}