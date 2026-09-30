// web/src/hooks/useProfile.ts
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useSession } from "@/hooks/useSession";

export type Profile = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

type ProfileRow = {
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function pickString(
  meta: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// DB 프로필이 없거나 값이 비어 있을 때 세션 정보로 만드는 기본 프로필 (SQL 트리거와 같은 규칙)
export function buildFallbackProfile(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email?.trim() || pickString(meta, ["email"]);

  const displayName =
    pickString(meta, [
      "nickname",
      "full_name",
      "name",
      "user_name",
      "preferred_username",
    ]) ??
    (email ? email.split("@")[0] : "") ??
    "";

  return {
    id: user.id,
    displayName: (displayName || `러너${user.id.slice(0, 4)}`).slice(0, 40),
    email: email || null,
    avatarUrl: pickString(meta, ["avatar_url", "picture"]),
  };
}

export function useProfile(): Profile | null {
  const { session } = useSession();
  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const [row, setRow] = useState<{ id: string; data: ProfileRow } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from("profiles")
      .select("display_name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("프로필 조회 실패:", error);
          return;
        }
        if (data) setRow({ id: userId, data: data as ProfileRow });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!user) return null;

  const fallback = buildFallbackProfile(user);
  const db = row && row.id === user.id ? row.data : null;

  return {
    id: user.id,
    displayName: db?.display_name?.trim() || fallback.displayName,
    email: db?.email?.trim() || fallback.email,
    avatarUrl: db?.avatar_url?.trim() || fallback.avatarUrl,
  };
}