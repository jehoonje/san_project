// 모든 사람이 저장한 장소의 분포.
// 좌표는 서버 밖으로 내보내지 않고, 행정구역별 "개수"만 돌려줍니다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  aggregateHeat,
  countsToJSON,
  type Boundaries,
  type Geo,
  type HeatCountsJSON,
  type HeatPoint,
} from "@/lib/regionHeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAGE = 1000;
const MAX_ROWS = 100_000;
/** 동 단위에서 이보다 적게 모인 곳은 숨김 (특정인의 동선이 드러나지 않게) */
const MIN_DONG_COUNT = 3;
const CACHE_MS = 10 * 60 * 1000;

type Payload = { counts: HeatCountsJSON; total: number; generatedAt: string };

let cached: { at: number; payload: Payload } | null = null;
let boundaries: Promise<Boundaries> | null = null;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("configuration_missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function loadBoundaries() {
  if (!boundaries) {
    const dir = path.join(process.cwd(), "public", "geo");
    const read = async (name: string) =>
      JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf8")) as Geo;
    boundaries = Promise.all([read("kr-sido"), read("kr-sgg"), read("kr-emd")])
      .then(([sido, sgg, emd]) => ({ sido, sgg, emd }))
      .catch((error) => {
        boundaries = null;
        throw error;
      });
  }
  return boundaries;
}

async function loadPoints(): Promise<HeatPoint[]> {
  const admin = adminClient();
  const points: HeatPoint[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await admin
      .from("route_places")
      .select("lat, lng")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) points.push({ lat: Number(row.lat), lng: Number(row.lng) });
    if (!data || data.length < PAGE) break;
  }
  return points;
}

export async function GET() {
  try {
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json(cached.payload, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }

    const [points, geo] = await Promise.all([loadPoints(), loadBoundaries()]);
    const { counts, total } = aggregateHeat(points, geo);
    const json = countsToJSON(counts);
    for (const [key, value] of Object.entries(json.emd)) {
      if (value < MIN_DONG_COUNT) delete json.emd[key];
    }

    const payload: Payload = { counts: json, total, generatedAt: new Date().toISOString() };
    cached = { at: Date.now(), payload };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    const code = error instanceof Error && error.message === "configuration_missing"
      ? "configuration_missing"
      : "heat_failed";
    console.error("모든 사람 분포 집계 실패:", error);
    return NextResponse.json({ error: code }, { status: code === "configuration_missing" ? 503 : 500 });
  }
}
