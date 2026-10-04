// web/src/app/api/place-insight/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const MOODS = [
  "calm", "lively", "cozy", "trendy", "vintage",
  "minimal", "romantic", "family", "work_friendly",
] as const;

const SCHEMA = {
  type: "object",
  properties: {
    price_level: { type: "integer", description: "1(저렴)~4(고가). 모르면 null" },
    price_note: { type: "string", description: "예: 음료 6천원대, 1인 2만원대" },
    keywords: { type: "array", items: { type: "string" } },
    moods: { type: "array", items: { type: "string", enum: [...MOODS] } },
    signature_menus: { type: "array", items: { type: "string" } },
    highlights: { type: "array", items: { type: "string" } },
    confidence: { type: "number", description: "0~1. 같은 장소가 확실한 정도" },
  },
  required: [
    "price_level", "price_note", "keywords", "moods",
    "signature_menus", "highlights", "confidence",
  ],
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const LIMIT = Number(process.env.INSIGHT_MONTHLY_SEARCH_LIMIT ?? 4500);

function monthKeyKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 7);
}

function countSearchQueries(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  let n = 0;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.queries)) n += obj.queries.length;
  for (const v of Object.values(obj)) n += countSearchQueries(v);
  return n;
}

const strArr = (v: unknown, max: number) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((x) => x.trim().slice(0, 40)).slice(0, max)
    : [];

function sanitize(raw: any) {
  const price = Number(raw?.price_level);
  return {
    price_level: Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
    price_note: typeof raw?.price_note === "string" ? raw.price_note.slice(0, 60) : null,
    keywords: strArr(raw?.keywords, 5),
    moods: strArr(raw?.moods, 3).filter((m) => (MOODS as readonly string[]).includes(m)),
    signature_menus: strArr(raw?.signature_menus, 3),
    highlights: strArr(raw?.highlights, 3),
    confidence: Math.min(1, Math.max(0, Number(raw?.confidence) || 0)),
  };
}

function extractSources(interaction: unknown) {
  const urls = new Set<string>();
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.type === "url_citation" && typeof o.url === "string") urls.add(o.url);
    Object.values(o).forEach(walk);
  };
  walk(interaction);
  return [...urls].slice(0, 5);
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const placeId = String(body?.placeId ?? "").trim();
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const address = String(body?.address ?? "").trim().slice(0, 120);
  const category = String(body?.category ?? "etc").trim().slice(0, 30);
  if (!placeId || !name) {
    return NextResponse.json({ error: "placeId, name required" }, { status: 400 });
  }

  const { data: cached } = await supabaseAdmin
    .from("place_insights").select("*").eq("place_id", placeId).maybeSingle();
  if (cached) return NextResponse.json({ insight: cached, cached: true });

  const month = monthKeyKST();
  const { data: usage } = await supabaseAdmin
    .from("llm_usage").select("search_count")
    .eq("month", month).eq("kind", "place_insight").maybeSingle();
  if ((usage?.search_count ?? 0) >= LIMIT) {
    return NextResponse.json({ error: "monthly_limit_reached" }, { status: 429 });
  }

  const prompt = [
    "다음 장소를 구글 검색으로 조사해서 JSON으로만 답하세요.",
    "같은 이름의 다른 지점과 혼동하지 말고, 주소가 일치하는 장소만 조사하세요.",
    "확실하지 않은 항목은 지어내지 말고 null 또는 빈 배열로 두세요.",
    "분위기(moods)는 허용된 값에서만 최대 3개 고르세요.",
    "한국어로 짧게 쓰세요. 확실하지 않으면 confidence를 낮게 주세요.",
    `이름: ${name}`,
    `주소: ${address || "알 수 없음"}`,
    `종류: ${category}`,
  ].join("\n");

  let interaction: any;
  try {
    interaction = await ai.interactions.create({
      model: MODEL,
      input: prompt,
      tools: [{ type: "google_search" }],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: SCHEMA,
      },
    } as any);
  } catch (e) {
    console.error("gemini 호출 실패:", e);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }

  const searches = Math.max(1, countSearchQueries(interaction));
  await supabaseAdmin.rpc("increment_llm_usage", {
    p_month: month, p_kind: "place_insight", p_by: searches,
  });

  let parsed;
  try {
    parsed = sanitize(JSON.parse(interaction.output_text));
  } catch {
    return NextResponse.json({ error: "invalid_llm_output" }, { status: 502 });
  }

  const row = {
    place_id: placeId, name, address, category,
    ...parsed,
    sources: extractSources(interaction),
    model: MODEL,
  };
  const { error } = await supabaseAdmin
    .from("place_insights").upsert(row, { onConflict: "place_id" });
  if (error) {
    console.error("인사이트 저장 실패:", error);
    return NextResponse.json({ error: "db_failed" }, { status: 500 });
  }

  return NextResponse.json({ insight: row, cached: false, searches });
}