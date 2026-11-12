import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ensurePlaceInsight,
  InsightLimitError,
} from "@/lib/server/placeInsight";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const body = await request.json().catch(() => null);
    const placeId = String(body?.placeId ?? "").trim().slice(0, 240);
    const name = String(body?.name ?? "").trim().slice(0, 80);
    const category = String(body?.category ?? "etc").trim().slice(0, 30);
    const regionDong = String(body?.regionDong ?? "").trim().slice(0, 120) || null;
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);

    if (!placeId || !name) {
      return NextResponse.json(
        { error: "placeId_and_name_required" },
        { status: 400 },
      );
    }

    const result = await ensurePlaceInsight(supabaseAdmin, {
      placeId,
      name,
      category,
      regionDong,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      force: body?.force === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InsightLimitError) {
      return NextResponse.json(
        { error: "monthly_limit_reached" },
        { status: 429 },
      );
    }

    console.error("place-insight 실패:", error);
    return NextResponse.json({ error: "insight_failed" }, { status: 500 });
  }
}
