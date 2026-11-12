import { NextResponse } from "next/server";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  analysisFingerprint,
  analyzePlaces,
  findMissingInsights,
  placeKeyOf,
  type RoutePlaceRow,
  type PlaceInsightRow,
} from "@/lib/server/placeAnalysis";

import {
  buildComparison,
  reportFingerprint,
} from "@/lib/server/tasteComparison";

import {
  generateReport,
  sanitizeReport,
  ReportGenerationError,
} from "@/lib/server/reportGenerator";

import {
  fetchRecommendationFeedback,
  type FeedbackAwareAnalysis,
} from "@/lib/server/recommendationFeedback";

import type {
  CohortSnapshot,
  ComparisonData,
} from "@/types/comparison";

import type {
  PersonalReport,
} from "@/types/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL =
  process.env.GEMINI_MODEL ??
  "gemini-3.5-flash-lite";

const VERSION =
  "comparison-v6-trace-observation";

const PLACE_PAGE_SIZE = 1000;
const INSIGHT_BATCH_SIZE = 500;

type RequestOptions = {
  force: boolean;
  allowPartial: boolean;
};

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
}

function adminClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server configuration missing",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function readOptions(
  request: Request,
): Promise<RequestOptions> {
  const input: unknown = await request
    .json()
    .catch(() => null);

  const body =
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  return {
    force: body.force === true,
    allowPartial:
      body.allowPartial === true,
  };
}

async function fetchPlaces(
  admin: SupabaseClient,
  userId: string,
): Promise<RoutePlaceRow[]> {
  const places: RoutePlaceRow[] = [];

  for (
    let offset = 0;
    ;
    offset += PLACE_PAGE_SIZE
  ) {
    const { data, error } = await admin
      .from("route_places")
      .select(
        [
          "id",
          "route_id",
          "name",
          "category",
          "lat",
          "lng",
          "dwell_minutes",
          "saved_at",
          "place_id",
          "region_dong",
        ].join(", "),
      )
      .eq("user_id", userId)
      .order("id", {
        ascending: true,
      })
      .range(
        offset,
        offset + PLACE_PAGE_SIZE - 1,
      );

    if (error) throw error;

    const rows =
      (data ?? []) as unknown as RoutePlaceRow[];

    places.push(...rows);

    if (
      rows.length < PLACE_PAGE_SIZE
    ) {
      break;
    }
  }

  return places;
}

async function fetchInsights(
  admin: SupabaseClient,
  places: RoutePlaceRow[],
): Promise<PlaceInsightRow[]> {
  const ids = [
    ...new Set(
      places.map(placeKeyOf),
    ),
  ];

  const insights: PlaceInsightRow[] = [];

  for (
    let index = 0;
    index < ids.length;
    index += INSIGHT_BATCH_SIZE
  ) {
    const { data, error } = await admin
      .from("place_insights")
      .select(
        [
          "place_id",
          "keywords",
          "moods",
          "signature_menus",
          "fetched_at",
        ].join(", "),
      )
      .in(
        "place_id",
        ids.slice(
          index,
          index + INSIGHT_BATCH_SIZE,
        ),
      );

    if (error) throw error;

    insights.push(
      ...(
        (data ?? []) as unknown as PlaceInsightRow[]
      ),
    );
  }

  return insights;
}

function emptyComparison(): ComparisonData {
  const now = new Date();

  return {
    asOf: now.toISOString(),

    from: new Date(
      now.getTime() -
        30 * 24 * 60 * 60 * 1000,
    ).toISOString(),

    myVisits: 0,
    categories: [],
    times: [],
    ready: false,
  };
}

async function fetchComparison(
  admin: SupabaseClient,
  userId: string,
  places: RoutePlaceRow[],
): Promise<ComparisonData> {
  const { data, error } =
    await admin.rpc(
      "taste_comparison_v1",
      {
        p_user_id: userId,
      },
    );

  if (error) throw error;

  if (!data) {
    throw new Error(
      "Comparison snapshot missing",
    );
  }

  return buildComparison(
    places,
    data as CohortSnapshot,
  );
}

export async function POST(
  request: Request,
) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim();

    if (!token) {
      return jsonResponse(
        {
          error: "unauthorized",
        },
        401,
      );
    }

    const admin = adminClient();

    const {
      data: auth,
      error: authError,
    } = await admin.auth.getUser(token);

    if (
      authError ||
      !auth.user
    ) {
      return jsonResponse(
        {
          error: "unauthorized",
        },
        401,
      );
    }

    const userId = auth.user.id;

    const options =
      await readOptions(request);

    const places =
      await fetchPlaces(
        admin,
        userId,
      );

    const insights =
      await fetchInsights(
        admin,
        places,
      );

    const baseAnalysis =
      analyzePlaces(
        places,
        insights,
      );

    const missingPlaces =
      findMissingInsights(
        places,
        insights,
      );

    if (places.length === 0) {
      return jsonResponse({
        status: "ready",
        analysis: baseAnalysis,
        comparison:
          emptyComparison(),
        report: null,
        generatedAt: null,
        cached: false,
        missingPlaces: [],
      });
    }

    if (
      missingPlaces.length > 0 &&
      !options.allowPartial
    ) {
      return jsonResponse({
        status:
          "needs_enrichment",
        analysis: baseAnalysis,
        report: null,
        generatedAt: null,
        cached: false,
        missingPlaces,
      });
    }

    const [
      comparison,
      recommendationFeedback,
    ] = await Promise.all([
      fetchComparison(
        admin,
        userId,
        places,
      ),

      fetchRecommendationFeedback(
        admin,
        userId,
        baseAnalysis,
      ),
    ]);

    const analysis: FeedbackAwareAnalysis = {
      ...baseAnalysis,
      recommendationFeedback,
    };

    // フィードバックも含めてキャッシュを区別します。
    const fingerprint =
      reportFingerprint({
        version: VERSION,
        model: MODEL,

        personal:
          analysisFingerprint(
            places,
            insights,
          ),

        analysis,
        comparison,
      });

    if (!options.force) {
      const {
        data: cached,
        error: cacheError,
      } = await admin
        .from("analysis_reports")
        .select(
          "report, generated_at, fingerprint",
        )
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle();

      if (cacheError) {
        throw cacheError;
      }

      if (
        cached?.fingerprint ===
          fingerprint &&
        cached.report
      ) {
        let cachedReport:
          | PersonalReport
          | null = null;

        try {
          cachedReport =
            sanitizeReport(
              cached.report,
            );
        } catch {
          cachedReport = null;
        }

        if (cachedReport) {
          return jsonResponse({
            status: "ready",
            analysis,
            comparison,
            report: cachedReport,

            generatedAt:
              cached.generated_at,

            cached: true,
            missingPlaces,
          });
        }
      }
    }

    const report =
      await generateReport({
        model: MODEL,
        analysis,
        comparison,

        missingCount:
          missingPlaces.length,
      });

    const generatedAt =
      new Date().toISOString();

    const {
      error: saveError,
    } = await admin
      .from("analysis_reports")
      .upsert(
        {
          user_id: userId,
          fingerprint,

          // 이번 생성에 사용한 피드백도 함께 보관합니다.
          stats: analysis,

          report,
          model: MODEL,

          generated_at:
            generatedAt,

          updated_at:
            generatedAt,
        },
        {
          onConflict:
            "user_id",
        },
      );

    if (saveError) {
      throw saveError;
    }

    return jsonResponse({
      status: "ready",
      analysis,
      comparison,
      report,
      generatedAt,
      cached: false,
      missingPlaces,
    });
  } catch (error) {
    console.error(
      "analysis-report 실패:",
      error,
    );

    if (
      error instanceof
      ReportGenerationError
    ) {
      const status =
        error.code ===
        "report_timeout"
          ? 504
          : error.code ===
              "report_rate_limited"
            ? 503
            : error.code ===
                "report_configuration_missing"
              ? 500
              : 502;

      return jsonResponse(
        {
          error: error.code,
        },
        status,
      );
    }

    return jsonResponse(
      {
        error:
          "analysis_failed",
      },
      500,
    );
  }
}