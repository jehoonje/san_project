import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 지구본의 "모든 사람" 분포를 서버에서 집계할 때 행정구역 경계 파일을 함께 배포
  outputFileTracingIncludes: {
    "/api/place-heat": ["./public/geo/**/*"],
  },
};

export default nextConfig;
