import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  analysisFingerprint,
  analyzePlaces,
  findMissingInsights,
  placeKeyOf,
  type PlaceInsightRow,
  type RoutePlaceRow,
} from "@/lib/server/placeAnalysis";
import type { PersonalReport } from "@/types/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    identity: { type: "string" },
    categoryPreference: { type: "string" },
    areaPreference: { type: "string" },
    timePattern: { type: "string" },
    moodAndSpending: { type: "string" },
    favoriteMenus: { type: "string" },
    recommendations: {
      type: "array",
      items: { type: "string" },
    },
    caveat: { type: "string" },
  },
  required: [
    "title",
    "summary",
    "identity",
    "categoryPreference",
    "areaPreference",
    "timePattern",
    "moodAndSpending",
    "favoriteMenus",
    "recommendations",
    "caveat",
  ],
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizeReport(raw: unknown): PersonalReport {
  const value = raw as Record<string, unknown>;
  return {
    title: text(value?.title, 60),
    summary: text(value?.summary, 500),
    identity: text(value?.identity, 300),
    categoryPreference: text(value?.categoryPreference, 300),
    areaPreference: text(value?.areaPreference, 300),
    timePattern: text(value?.timePattern, 300),
    moodAndSpending: text(value?.moodAndSpending, 300),
    favoriteMenus: text(value?.favoriteMenus, 300),
    recommendations: Array.isArray(value?.recommendations)
      ? value.recommendations
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 180))
          .filter(Boolean)
          .slice(0, 4)
      : [],
    caveat: text(value?.caveat, 300),
  };
}

function emptyReportMessage(totalVisits: number) {
  return totalVisits < 3
    ? "저장된 방문이 3개 미만이라 아직 취향을 단정하기 어렵습니다."
    : "일부 장소의 상세 정보가 없어 확인 가능한 기록만으로 분석했습니다.";
}

export async function POST(request: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: auth, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !auth.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;
    const allowPartial = body?.allowPartial === true;

    const { data: rawPlaces, error: placesError } = await supabaseAdmin
      .from("route_places")
      .select(
        "id, route_id, name, category, lat, lng, dwell_minutes, saved_at, place_id, region_dong",
      )
      .eq("user_id", auth.user.id)
      .order("saved_at", { ascending: true });

    if (placesError) throw placesError;
    const places = (rawPlaces ?? []) as RoutePlaceRow[];

    const placeIds = [...new Set(places.map(placeKeyOf))];
    let insights: PlaceInsightRow[] = [];

    if (placeIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("place_insights")
        .select("place_id, keywords, moods, signature_menus, fetched_at")
        .in("place_id", placeIds);

      if (error) throw error;
      insights = (data ?? []) as PlaceInsightRow[];
    }

    const analysis = analyzePlaces(places, insights);
    const missingPlaces = findMissingInsights(places, insights);

    if (missingPlaces.length > 0 && !allowPartial) {
      return NextResponse.json({
        status: "needs_enrichment",
        analysis,
        report: null,
        generatedAt: null,
        cached: false,
        missingPlaces,
      });
    }

    const fingerprint = analysisFingerprint(places, insights);
    const { data: cached, error: cacheError } = await supabaseAdmin
      .from("analysis_reports")
      .select("report, generated_at, fingerprint")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (cacheError) throw cacheError;
    if (!force && cached?.fingerprint === fingerprint) {
      return NextResponse.json({
        status: "ready",
        analysis,
        report: cached.report,
        generatedAt: cached.generated_at,
        cached: true,
        missingPlaces,
      });
    }

    if (places.length === 0) {
      return NextResponse.json({
        status: "ready",
        analysis,
        report: null,
        generatedAt: null,
        cached: false,
        missingPlaces: [],
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

    const prompt = [
      "아래 방문 통계를 바탕으로 사용자의 장소 취향 리포트를 작성하세요.",
      "검색 도구는 사용하지 마세요. 제공된 데이터 밖의 사실을 만들지 마세요.",
      "표본이 적거나 값이 비어 있으면 그 한계를 caveat에 명확히 쓰세요.",
      "질병, 소득, 정치 성향, 종교 등 민감한 특성을 추론하지 마세요.",
      "친근하지만 과장하지 않는 한국어로 작성하세요.",
      `표본 주의: ${emptyReportMessage(analysis.totalVisits)}`,
      JSON.stringify(analysis),
    ].join("\n");

    const ai = new GoogleGenAI({ apiKey });
    const interaction = (await ai.interactions.create({
      model: MODEL,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: REPORT_SCHEMA,
      },
    } as never)) as unknown as Record<string, unknown>;

    if (typeof interaction.output_text !== "string") {
      throw new Error("Gemini output_text is missing");
    }

    const report = sanitizeReport(JSON.parse(interaction.output_text));
    const generatedAt = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin
      .from("analysis_reports")
      .upsert(
        {
          user_id: auth.user.id,
          fingerprint,
          stats: analysis,
          report,
          model: MODEL,
          generated_at: generatedAt,
          updated_at: generatedAt,
        },
        { onConflict: "user_id" },
      );

    if (saveError) throw saveError;

    return NextResponse.json({
      status: "ready",
      analysis,
      report,
      generatedAt,
      cached: false,
      missingPlaces,
    });
  } catch (error) {
    console.error("analysis-report 실패:", error);
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}
