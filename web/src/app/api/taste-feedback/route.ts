import { NextResponse } from "next/server";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  buildPlaceTraitPatterns,
} from "@/lib/placeTraits";

import type {
  PlaceAnalysisStats,
} from "@/types/analysis";

export const runtime = "nodejs";

type Reaction = "agree" | "disagree";

type ReportContext = {
  fingerprint: string;
  traitKeys: Set<string>;
};

class ApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
  }
}

function json(
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

function createAdmin(): SupabaseClient {
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

async function authenticate(
  request: Request,
) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();

  if (!token) {
    throw new ApiError(
      "unauthorized",
      401,
    );
  }

  const admin = createAdmin();

  const { data, error } =
    await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new ApiError(
      "unauthorized",
      401,
    );
  }

  return {
    admin,
    userId: data.user.id,
  };
}

async function getReportContext(
  admin: SupabaseClient,
  userId: string,
): Promise<ReportContext | null> {
  const { data, error } = await admin
    .from("analysis_reports")
    .select("fingerprint, stats")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (
    !data ||
    typeof data.fingerprint !== "string"
  ) {
    return null;
  }

  const stats =
    data.stats as PlaceAnalysisStats | null;

  const result = buildPlaceTraitPatterns(
    stats?.placeEvidence,
  );

  return {
    fingerprint: data.fingerprint,
    traitKeys: new Set(
      result.patterns.map(
        (pattern) => pattern.key,
      ),
    ),
  };
}

function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return json(
      {
        error: error.message,
      },
      error.status,
    );
  }

  console.error(
    "취향 피드백 처리 실패:",
    error,
  );

  return json(
    {
      error: "feedback_failed",
    },
    500,
  );
}

export async function GET(
  request: Request,
) {
  try {
    const { admin, userId } =
      await authenticate(request);

    const context =
      await getReportContext(
        admin,
        userId,
      );

    if (!context) {
      return json({
        fingerprint: null,
        feedback: [],
      });
    }

    const { data, error } = await admin
      .from("taste_trait_feedback")
      .select("trait_key, reaction")
      .eq("user_id", userId);

    if (error) throw error;

    const feedback = (data ?? [])
      .filter(
        (row) =>
          context.traitKeys.has(
            row.trait_key,
          ) &&
          (
            row.reaction === "agree" ||
            row.reaction === "disagree"
          ),
      )
      .map((row) => ({
        traitKey: row.trait_key,
        reaction: row.reaction,
      }));

    return json({
      fingerprint:
        context.fingerprint,
      feedback,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
) {
  try {
    const { admin, userId } =
      await authenticate(request);

    const input: unknown = await request
      .json()
      .catch(() => null);

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw new ApiError(
        "invalid_request",
        400,
      );
    }

    const body =
      input as Record<string, unknown>;

    const traitKey =
      typeof body.traitKey === "string"
        ? body.traitKey.trim()
        : "";

    const fingerprint =
      typeof body.fingerprint === "string"
        ? body.fingerprint.trim()
        : "";

    const reaction = body.reaction;

    if (
      !traitKey ||
      traitKey.length > 120 ||
      !fingerprint ||
      fingerprint.length > 128 ||
      (
        reaction !== "agree" &&
        reaction !== "disagree" &&
        reaction !== null
      )
    ) {
      throw new ApiError(
        "invalid_request",
        400,
      );
    }

    const context =
      await getReportContext(
        admin,
        userId,
      );

    if (!context) {
      throw new ApiError(
        "report_not_found",
        404,
      );
    }

    if (
      context.fingerprint !==
      fingerprint
    ) {
      throw new ApiError(
        "report_changed",
        409,
      );
    }

    if (
      !context.traitKeys.has(
        traitKey,
      )
    ) {
      throw new ApiError(
        "trait_not_found",
        400,
      );
    }

    if (reaction === null) {
      const { error } = await admin
        .from("taste_trait_feedback")
        .delete()
        .eq("user_id", userId)
        .eq("trait_key", traitKey);

      if (error) throw error;

      return json({
        traitKey,
        reaction: null,
      });
    }

    const { error } = await admin
      .from("taste_trait_feedback")
      .upsert(
        {
          user_id: userId,
          trait_key: traitKey,
          reaction:
            reaction as Reaction,
          report_fingerprint:
            fingerprint,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "user_id,trait_key",
        },
      );

    if (error) throw error;

    return json({
      traitKey,
      reaction,
    });
  } catch (error) {
    return handleError(error);
  }
}