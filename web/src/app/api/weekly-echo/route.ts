// 주간 잔향: 그 주의 걸음을 한 장으로 묶습니다.
// 사람을 규정하지 않고, 그 주에 실제로 있었던 일만 관찰해 짧게 적습니다.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "그 주를 부르는 짧은 제목. 6~16자" },
    lines: {
      type: "array",
      items: { type: "string" },
      description: "관찰 2~3줄. 각 줄 20~45자",
    },
  },
  required: ["title", "lines"],
};

type Body = { weekStart?: string; force?: boolean };

type RouteRow = {
  id: string;
  title: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string;
};

type PlaceRow = {
  name: string;
  category: string;
  region_dong: string | null;
  saved_at: string;
  dwell_minutes: number | null;
};

export type WeeklyStats = {
  routeCount: number;
  meters: number;
  minutes: number;
  placeCount: number;
  /** 그 주에 걸은 날 (요일 0=일) */
  days: number[];
  regions: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  newPlaces: string[];
  longestMeters: number;
  latestHour: number | null;
};

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("configuration_missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
}

/** KST 기준 그 주 월요일 (YYYY-MM-DD) */
function weekStartKST(at: Date) {
  const kst = new Date(at.getTime() + 9 * 3600 * 1000);
  const day = (kst.getUTCDay() + 6) % 7; // 월=0
  kst.setUTCDate(kst.getUTCDate() - day);
  return kst.toISOString().slice(0, 10);
}

function weekRangeUTC(weekStart: string) {
  // KST 월요일 00:00 = UTC 전날 15:00
  const from = new Date(`${weekStart}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 7 * 86400 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function tally(values: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildStats(routes: RouteRow[], places: PlaceRow[], before: Set<string>): WeeklyStats {
  const days = new Set<number>();
  let meters = 0;
  let seconds = 0;
  let longest = 0;
  let latestHour: number | null = null;

  for (const route of routes) {
    const start = new Date(route.started_at);
    const kst = new Date(start.getTime() + 9 * 3600 * 1000);
    days.add(kst.getUTCDay());
    meters += route.distance_meters ?? 0;
    seconds += route.duration_seconds ?? 0;
    longest = Math.max(longest, route.distance_meters ?? 0);
    const hour = kst.getUTCHours();
    if (latestHour === null || hour > latestHour) latestHour = hour;
  }

  const newPlaces = [
    ...new Set(places.filter((p) => !before.has(p.name)).map((p) => p.name)),
  ].slice(0, 6);

  return {
    routeCount: routes.length,
    meters: Math.round(meters),
    minutes: Math.round(seconds / 60),
    placeCount: places.length,
    days: [...days].sort(),
    regions: tally(places.map((p) => p.region_dong)).slice(0, 4),
    categories: tally(places.map((p) => p.category)).slice(0, 4),
    newPlaces,
    longestMeters: Math.round(longest),
    latestHour,
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  cafe: "카페",
  restaurant: "식당",
  bar: "술집",
  park: "공원",
  shop: "소품샵",
  culture: "문화",
  etc: "그 밖",
};

function prompt(stats: WeeklyStats) {
  const input = {
    ...stats,
    categories: stats.categories.map((c) => ({
      ...c,
      name: CATEGORY_LABEL[c.name] ?? c.name,
    })),
  };

  return `
당신은 한 사람의 일주일치 걸음 기록을 읽고, 그 주에 있었던 일을 짧게 적는 사람입니다.

쓰는 법
- 사람을 규정하지 마세요. "당신은 ~한 사람"이라는 식의 문장은 쓰지 않습니다.
- 입력에 있는 사실만 씁니다. 없는 장소, 날씨, 기분, 동행은 만들지 마세요.
- 담담하게, 관찰한 것만 적습니다. 칭찬하거나 북돋우지 마세요.
- "취향", "분석", "통계", "성향" 같은 말은 쓰지 않습니다.
- 숫자는 입력 그대로만 씁니다. 거리는 km로 소수 첫째 자리까지.
- 이모지, 해시태그, 느낌표는 쓰지 않습니다.
- 한국어로, 존댓말로 씁니다.

title
- 그 주를 부르는 짧은 이름. 6~16자.
- 사람이 아니라 그 주의 걸음이나 장소를 가리킵니다. 예: "골목을 따라 걸은 주"

lines
- 2~3줄. 각 줄 20~45자.
- 첫 줄은 그 주에 가장 눈에 띄는 사실 하나.
- 기록이 적으면 줄 수를 줄이고, 억지로 늘리지 마세요.

[이번 주 기록]
${JSON.stringify(input)}
`.trim();
}

function fallbackBody(stats: WeeklyStats) {
  const km = (stats.meters / 1000).toFixed(1);
  const lines: string[] = [];
  if (stats.routeCount > 0) {
    lines.push(`${stats.days.length}일 동안 ${km}km를 걸었어요.`);
  }
  if (stats.regions[0]) {
    lines.push(`${stats.regions[0].name}에 가장 자주 머물렀어요.`);
  }
  if (stats.newPlaces.length > 0) {
    lines.push(`${stats.newPlaces[0]}을(를) 처음 남겼어요.`);
  }
  return { title: "이번 주의 걸음", lines: lines.slice(0, 3) };
}

function sanitizeBody(raw: unknown, stats: WeeklyStats) {
  if (!raw || typeof raw !== "object") return fallbackBody(stats);
  const value = raw as { title?: unknown; lines?: unknown };
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim().slice(0, 40)
      : "이번 주의 걸음";
  const lines = Array.isArray(value.lines)
    ? value.lines
        .filter((line): line is string => typeof line === "string" && !!line.trim())
        .map((line) => line.trim().slice(0, 120))
        .slice(0, 3)
    : [];
  return lines.length > 0 ? { title, lines } : { ...fallbackBody(stats), title };
}

export async function POST(request: Request) {
  try {
    const admin = adminClient();

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);

    const { data: auth, error: authError } = await admin.auth.getUser(token);
    const userId = auth?.user?.id;
    if (authError || !userId) return jsonResponse({ error: "unauthorized" }, 401);

    const body = ((await request.json().catch(() => null)) ?? {}) as Body;
    const weekStart =
      typeof body.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
        ? body.weekStart
        : weekStartKST(new Date());

    // 이미 만들어 둔 잔향이 있으면 그대로
    if (!body.force) {
      const { data: cached } = await admin
        .from("weekly_echoes")
        .select("stats, body, generated_at, shared_at")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (cached) {
        return jsonResponse({
          status: "ready",
          weekStart,
          cached: true,
          ...cached,
        });
      }
    }

    const { from, to } = weekRangeUTC(weekStart);

    const { data: routeRows, error: routeError } = await admin
      .from("routes")
      .select("id, title, distance_meters, duration_seconds, started_at, ended_at")
      .eq("user_id", userId)
      .gte("started_at", from)
      .lt("started_at", to)
      .order("started_at", { ascending: true });
    if (routeError) throw routeError;

    const routes = (routeRows ?? []) as RouteRow[];
    if (routes.length === 0) {
      return jsonResponse({ status: "empty", weekStart });
    }

    const { data: placeRows, error: placeError } = await admin
      .from("route_places")
      .select("name, category, region_dong, saved_at, dwell_minutes, route_id")
      .in(
        "route_id",
        routes.map((route) => route.id),
      );
    if (placeError) throw placeError;
    const places = (placeRows ?? []) as PlaceRow[];

    // 그 주 이전에 남긴 장소 이름 (처음 남긴 곳을 가리기 위해)
    const { data: olderRows } = await admin
      .from("route_places")
      .select("name, saved_at")
      .eq("user_id", userId)
      .lt("saved_at", from)
      .limit(2000);
    const before = new Set(
      ((olderRows ?? []) as Array<{ name: string }>).map((row) => row.name),
    );

    const stats = buildStats(routes, places, before);

    let echo = fallbackBody(stats);
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: prompt(stats),
          config: {
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
            temperature: 0.7,
          },
        });
        echo = sanitizeBody(JSON.parse(response.text ?? "null"), stats);
      } catch (error) {
        // 모델이 막혀도 숫자만으로 한 장은 만들어 줍니다
        console.error("주간 잔향 생성 실패, 기본 문장으로 대체:", error);
      }
    }

    const { error: saveError } = await admin.from("weekly_echoes").upsert(
      {
        user_id: userId,
        week_start: weekStart,
        stats,
        body: echo,
        model: apiKey ? MODEL : "fallback",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_start" },
    );
    if (saveError) throw saveError;

    return jsonResponse({
      status: "ready",
      weekStart,
      cached: false,
      stats,
      body: echo,
      generated_at: new Date().toISOString(),
      shared_at: null,
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === "configuration_missing"
        ? "configuration_missing"
        : "echo_failed";
    console.error("주간 잔향 실패:", error);
    return jsonResponse({ error: code }, code === "configuration_missing" ? 503 : 500);
  }
}
