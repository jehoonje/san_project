// web/src/lib/weeklyEcho.ts
// 주간 잔향: 그 주의 걸음을 한 장으로 묶은 것. 서클에 건네면 함께 걷는 사람들이 봅니다.
import { supabase } from "@/lib/supabaseClient";
import { isMissingTable } from "@/lib/circles";

export type EchoBody = { title: string; lines: string[] };

export type EchoStats = {
  routeCount: number;
  meters: number;
  minutes: number;
  placeCount: number;
  days: number[];
  regions: Array<{ name: string; count: number }>;
  newPlaces: string[];
};

export type WeeklyEcho = {
  weekStart: string;
  stats: EchoStats;
  body: EchoBody;
  generatedAt: string;
  sharedAt: string | null;
};

export type EchoState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; echo: WeeklyEcho }
  | { status: "error"; message: string };

const EVENT = "san-echo-change";

export function onEchoChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** KST 기준 그 주 월요일 */
export function weekStartOf(at: Date = new Date()) {
  const kst = new Date(at.getTime() + 9 * 3600 * 1000);
  const day = (kst.getUTCDay() + 6) % 7;
  kst.setUTCDate(kst.getUTCDate() - day);
  return kst.toISOString().slice(0, 10);
}

/** 지난주 월요일 (일요일 밤에 건네는 것은 지난 한 주) */
export function lastWeekStart(at: Date = new Date()) {
  const monday = new Date(`${weekStartOf(at)}T00:00:00+09:00`);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return monday.toISOString().slice(0, 10);
}

export function weekLabel(weekStart: string) {
  const from = new Date(`${weekStart}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 6 * 86400 * 1000);
  const fmt = (d: Date) => {
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(
      kst.getUTCDate(),
    ).padStart(2, "0")}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

type Raw = {
  status?: string;
  weekStart?: string;
  stats?: EchoStats;
  body?: EchoBody;
  generated_at?: string;
  shared_at?: string | null;
  error?: string;
};

const ERRORS: Record<string, string> = {
  configuration_missing: "아직 잔향을 만들 수 없어요",
  unauthorized: "다시 로그인해 주세요",
};

/** 그 주의 잔향을 가져오거나, 없으면 만듭니다 */
export async function fetchEcho(
  accessToken: string,
  weekStart: string,
  force = false,
): Promise<EchoState> {
  try {
    const response = await fetch("/api/weekly-echo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ weekStart, force }),
    });

    const raw = (await response.json().catch(() => null)) as Raw | null;

    if (!response.ok) {
      return {
        status: "error",
        message: ERRORS[raw?.error ?? ""] ?? "잔향을 불러오지 못했어요",
      };
    }
    if (raw?.status === "empty") return { status: "empty" };
    if (!raw?.body || !raw.stats) return { status: "empty" };

    return {
      status: "ready",
      echo: {
        weekStart: raw.weekStart ?? weekStart,
        stats: raw.stats,
        body: raw.body,
        generatedAt: raw.generated_at ?? new Date().toISOString(),
        sharedAt: raw.shared_at ?? null,
      },
    };
  } catch (error) {
    console.error("주간 잔향 조회 실패:", error);
    return { status: "error", message: "잔향을 불러오지 못했어요" };
  }
}

/** 서클에 건네기 (되돌리려면 share=false) */
export async function shareEcho(weekStart: string, share: boolean) {
  const { error } = await supabase
    .from("weekly_echoes")
    .update({ shared_at: share ? new Date().toISOString() : null })
    .eq("week_start", weekStart);
  if (error && !isMissingTable(error)) throw error;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export type CircleEcho = WeeklyEcho & {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

/** 서클이 건넨 잔향들 */
export async function listCircleEchoes(
  weekStart: string,
  myId: string,
): Promise<CircleEcho[]> {
  const { data, error } = await supabase
    .from("weekly_echoes")
    .select(
      "user_id, week_start, stats, body, generated_at, shared_at, profiles ( display_name, avatar_url )",
    )
    .eq("week_start", weekStart)
    .not("shared_at", "is", null);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  type Row = {
    user_id: string;
    week_start: string;
    stats: EchoStats;
    body: EchoBody;
    generated_at: string;
    shared_at: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.user_id !== myId)
    .map((row) => ({
      userId: row.user_id,
      displayName: row.profiles?.display_name?.trim() || "산책자",
      avatarUrl: row.profiles?.avatar_url ?? null,
      weekStart: row.week_start,
      stats: row.stats,
      body: row.body,
      generatedAt: row.generated_at,
      sharedAt: row.shared_at,
    }));
}
