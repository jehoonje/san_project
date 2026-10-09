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

function GoogleIcon() {
  return (
    <span
      className="san-google-mark"
      aria-hidden="true"
    >
      G
    </span>
  );
}

function KakaoIcon() {
  return (
    <svg
      className="san-kakao-mark"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.3 4.8 6.7l-1.2 4.1c-.1.4.3.7.6.5l4.8-3.3c.3 0 .7.1 1 .1 5.5 0 10-3.5 10-8.1S17.5 3 12 3Z"
      />
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