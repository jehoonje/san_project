// web/src/app/api/region-dong/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ regionDong: null }, { status: 400 });
  }

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } },
  );
  if (!res.ok) return NextResponse.json({ regionDong: null });

  const json = await res.json();
  const docs: Array<{ region_type: string; region_3depth_name: string }> =
    json.documents ?? [];
  const h = docs.find((d) => d.region_type === "H") ?? docs[0];
  return NextResponse.json({ regionDong: h?.region_3depth_name || null });
}