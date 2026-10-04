import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

const MOODS = [
  "calm",
  "lively",
  "cozy",
  "trendy",
  "vintage",
  "minimal",
  "romantic",
  "family",
  "work_friendly",
] as const;

const SCHEMA = {
  type: "object",
  properties: {
    price_level: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "1(저렴)~4(고가). 모르면 null",
    },
    price_note: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "예: 음료 6천원대, 1인 2만원대",
    },
    keywords: { type: "array", items: { type: "string" } },
    moods: {
      type: "array",
      items: { type: "string", enum: [...MOODS] },
    },
    signature_menus: { type: "array", items: { type: "string" } },
    highlights: { type: "array", items: { type: "string" } },
    confidence: {
      type: "number",
      description: "0~1. 검색 결과가 같은 장소라고 확신하는 정도",
    },
  },
  required: [
    "price_level",
    "price_note",
    "keywords",
    "moods",
    "signature_menus",
    "highlights",
    "confidence",
  ],
};

const CACHE_DAYS = Number(process.env.INSIGHT_CACHE_DAYS ?? 90);
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const LIMIT = Number(process.env.INSIGHT_MONTHLY_SEARCH_LIMIT ?? 4500);

export type PlaceInsightInput = {
  placeId: string;
  name: string;
  category: string;
  regionDong?: string | null;
  lat?: number | null;
  lng?: number | null;
  force?: boolean;
};

export class InsightLimitError extends Error {
  constructor() {
    super("monthly_limit_reached");
    this.name = "InsightLimitError";
  }
}

function monthKeyKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 7);
}

function countSearchQueries(node: unknown): number {
  if (!node || typeof node !== "object") return 0;

  let count = 0;
  const object = node as Record<string, unknown>;

  if (Array.isArray(object.queries)) {
    count += object.queries.length;
  }

  for (const value of Object.values(object)) {
    count += countSearchQueries(value);
  }

  return count;
}

function stringArray(value: unknown, max: number) {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
        .map((item) => item.trim().slice(0, 40))
        .slice(0, max)
    : [];
}

function sanitize(raw: unknown) {
  const value = raw as Record<string, unknown> | null;
  const price = Number(value?.price_level);

  return {
    price_level:
      Number.isInteger(price) && price >= 1 && price <= 4
        ? price
        : null,
    price_note:
      typeof value?.price_note === "string"
        ? value.price_note.trim().slice(0, 60) || null
        : null,
    keywords: stringArray(value?.keywords, 5),
    moods: stringArray(value?.moods, 3).filter((mood) =>
      (MOODS as readonly string[]).includes(mood),
    ),
    signature_menus: stringArray(value?.signature_menus, 3),
    highlights: stringArray(value?.highlights, 3),
    confidence: Math.min(
      1,
      Math.max(0, Number(value?.confidence) || 0),
    ),
  };
}

function extractSources(interaction: unknown) {
  const sources = new Set<string>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;

    const object = node as Record<string, unknown>;
    if (object.type === "url_citation") {
      if (typeof object.title === "string" && object.title.trim()) {
        sources.add(object.title.trim().slice(0, 100));
      } else if (typeof object.url === "string") {
        try {
          sources.add(new URL(object.url).hostname.replace(/^www\./, ""));
        } catch {
          // 잘못된 URL은 출처 목록에서 제외합니다.
        }
      }
    }

    Object.values(object).forEach(walk);
  };

  walk(interaction);
  return [...sources].slice(0, 5);
}

function isFresh(fetchedAt: unknown) {
  if (typeof fetchedAt !== "string") return false;

  const fetched = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetched)) return false;

  return Date.now() - fetched < CACHE_DAYS * 24 * 60 * 60 * 1000;
}

export async function ensurePlaceInsight(
  supabaseAdmin: SupabaseClient,
  input: PlaceInsightInput,
) {
  const { data: cached, error: cacheError } = await supabaseAdmin
    .from("place_insights")
    .select("*")
    .eq("place_id", input.placeId)
    .maybeSingle();

  if (cacheError) throw cacheError;
  if (cached && !input.force && isFresh(cached.fetched_at)) {
    return { insight: cached, cached: true, searches: 0 };
  }

  const month = monthKeyKST();
  const { data: usage, error: usageError } = await supabaseAdmin
    .from("llm_usage")
    .select("search_count")
    .eq("month", month)
    .eq("kind", "place_insight")
    .maybeSingle();

  if (usageError) throw usageError;
  if ((usage?.search_count ?? 0) >= LIMIT) {
    throw new InsightLimitError();
  }

  const location = [
    input.regionDong?.trim() || null,
    Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? `좌표 ${Number(input.lat).toFixed(5)}, ${Number(input.lng).toFixed(5)}`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");

  const prompt = [
    "다음 장소를 Google 검색으로 조사하고 지정된 JSON 형식으로만 답하세요.",
    "같은 이름의 다른 지점과 혼동하지 말고 위치가 일치하는 장소만 조사하세요.",
    "확실하지 않은 항목은 추측하지 말고 null 또는 빈 배열로 두세요.",
    "분위기(moods)는 허용된 값에서 최대 3개만 고르세요.",
    "모든 문구는 한국어로 짧게 작성하세요.",
    `이름: ${input.name}`,
    `위치: ${location || "알 수 없음"}`,
    `종류: ${input.category}`,
  ].join("\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const ai = new GoogleGenAI({ apiKey });
  const interaction = (await ai.interactions.create({
    model: MODEL,
    input: prompt,
    tools: [{ type: "google_search" }],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: SCHEMA,
    },
  } as never)) as unknown as Record<string, unknown>;

  const searches = Math.max(1, countSearchQueries(interaction));
  const { error: incrementError } = await supabaseAdmin.rpc(
    "increment_llm_usage",
    {
      p_month: month,
      p_kind: "place_insight",
      p_by: searches,
    },
  );

  if (incrementError) throw incrementError;

  const outputText = interaction.output_text;
  if (typeof outputText !== "string") {
    throw new Error("Gemini output_text is missing");
  }

  const parsed = sanitize(JSON.parse(outputText));
  const row = {
    place_id: input.placeId,
    name: input.name,
    address: input.regionDong ?? null,
    category: input.category,
    ...parsed,
    sources: extractSources(interaction),
    model: MODEL,
    fetched_at: new Date().toISOString(),
  };

  const { data: saved, error: saveError } = await supabaseAdmin
    .from("place_insights")
    .upsert(row, { onConflict: "place_id" })
    .select("*")
    .single();

  if (saveError) throw saveError;
  return { insight: saved, cached: false, searches };
}
