// web/src/app/api/region-dong/route.ts
// 좌표의 동네 이름. 한국 안은 카카오(행정동), 그 밖은 OpenStreetMap에서 찾습니다.
import { NextResponse } from "next/server";
import { regionNameOsm } from "@/lib/places/osmClient";
import { inKoreaBounds } from "@/lib/places/types";

async function kakaoDong(lat: number, lng: number): Promise<string | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const docs: Array<{ region_type: string; region_3depth_name: string }> =
      json.documents ?? [];
    const h = docs.find((d) => d.region_type === "H") ?? docs[0];
    return h?.region_3depth_name || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json({ regionDong: null }, { status: 400 });
  }

  // 한국 안에서는 카카오가 행정동을 정확히 줍니다. 비었으면 같은 방식으로 다른 곳에서 찾습니다.
  const korean = inKoreaBounds(lat, lng) ? await kakaoDong(lat, lng) : null;
  const regionDong = korean ?? (await regionNameOsm(lat, lng));
  return NextResponse.json({ regionDong });
}
