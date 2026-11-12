"use client";

import type {
  SocialProvider,
} from "@/lib/oauth";

type SocialButtonsProps = {
  disabled: boolean;
  busyProvider?: SocialProvider | null;
  onSelect: (
    provider: SocialProvider,
  ) => void;
};

// 브랜드 색 대신 잉크 한 색의 라인 마크만 둡니다.
function GoogleIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12.2H12.4M20 12.2a8 8 0 1 1-2.5-6" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg className="san-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5c-4.7 0-8.5 2.9-8.5 6.6 0 2.3 1.5 4.3 3.8 5.5l-.9 3.4 3.9-2.5c.5.1 1.1.1 1.7.1 4.7 0 8.5-2.9 8.5-6.5S16.7 4.5 12 4.500Z" />
    </svg>
  );
}

export function SocialButtons({
  disabled,
  busyProvider = null,
  onSelect,
}: SocialButtonsProps) {
  return (
    <div className="san-social-list">
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSelect("google")
        }
        className="san-social-button san-social-google"
      >
        <span className="san-social-icon">
          <GoogleIcon />
        </span>

        <span>
          {busyProvider === "google"
            ? "Google 연결 중..."
            : "Google로 계속하기"}
        </span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSelect("kakao")
        }
        className="san-social-button san-social-kakao"
      >
        <span className="san-social-icon">
          <KakaoIcon />
        </span>

        <span>
          {busyProvider === "kakao"
            ? "카카오 연결 중..."
            : "카카오로 계속하기"}
        </span>
      </button>
    </div>
  );
}