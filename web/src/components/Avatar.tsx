// web/src/components/Avatar.tsx
"use client";

import { useState } from "react";

type AvatarProps = {
  url: string | null;
  name: string;
  size?: number;
};

function AvatarInner({ url, name, size = 40 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="rounded-full bg-neutral-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-[#ff5a36] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}

// url이 바뀌면 이미지 실패 상태를 초기화하기 위해 key로 리마운트
export function Avatar(props: AvatarProps) {
  return <AvatarInner key={props.url ?? "none"} {...props} />;
}