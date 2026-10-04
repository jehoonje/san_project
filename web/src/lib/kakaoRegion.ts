// web/src/lib/kakaoRegion.ts
export async function fetchRegionDong(lat: number, lng: number) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const docs: Array<{ region_type: string; region_3depth_name: string }> =
    json.documents ?? [];
  const h = docs.find((d) => d.region_type === "H") ?? docs[0];
  return h?.region_3depth_name || null;
}