import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NominatimResponse = {
  name?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    province?: string;
    state?: string;
    county?: string;
    city_district?: string;
  };
  namedetails?: Record<string, string>;
};

type WeatherResponse = {
  current?: {
    temperature_2m?: number;
  };
};

const KOREAN_REGION_ENGLISH: Record<string, string> = {
  서울: "Seoul",
  서울특별시: "Seoul",
  부산: "Busan",
  부산광역시: "Busan",
  대구: "Daegu",
  대구광역시: "Daegu",
  인천: "Incheon",
  인천광역시: "Incheon",
  광주: "Gwangju",
  광주광역시: "Gwangju",
  대전: "Daejeon",
  대전광역시: "Daejeon",
  울산: "Ulsan",
  울산광역시: "Ulsan",
  세종: "Sejong",
  세종특별자치시: "Sejong",
  경기도: "Gyeonggi",
  강원특별자치도: "Gangwon",
  충청북도: "North Chungcheong",
  충청남도: "South Chungcheong",
  전북특별자치도: "North Jeolla",
  전라남도: "South Jeolla",
  경상북도: "North Gyeongsang",
  경상남도: "South Gyeongsang",
  제주특별자치도: "Jeju",
};

function parseCoordinate(
  value: string | null,
  min: number,
  max: number,
): number | null {
  if (!value) return null;

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    return null;
  }

  return parsed;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
) {
  return values.find(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0,
  );
}

function cleanEnglishRegion(value: string) {
  return value
    .replace(
      /\b(Special Self-Governing Province|Special Self-Governing City|Metropolitan City|Special City|Province)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function GET(request: NextRequest) {
  const lat = parseCoordinate(
    request.nextUrl.searchParams.get("lat"),
    -90,
    90,
  );

  const lng = parseCoordinate(
    request.nextUrl.searchParams.get("lng"),
    -180,
    180,
  );

  if (lat === null || lng === null) {
    return NextResponse.json(
      {
        error: "올바른 위도와 경도가 필요합니다.",
      },
      { status: 400 },
    );
  }

  const nominatimUrl = new URL(
    "https://nominatim.openstreetmap.org/reverse",
  );

  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("lat", lat.toString());
  nominatimUrl.searchParams.set("lon", lng.toString());
  nominatimUrl.searchParams.set("zoom", "10");
  nominatimUrl.searchParams.set("addressdetails", "1");
  nominatimUrl.searchParams.set("namedetails", "1");
  nominatimUrl.searchParams.set(
    "accept-language",
    "ko,en",
  );

  const weatherUrl = new URL(
    "https://api.open-meteo.com/v1/forecast",
  );

  weatherUrl.searchParams.set(
    "latitude",
    lat.toString(),
  );
  weatherUrl.searchParams.set(
    "longitude",
    lng.toString(),
  );
  weatherUrl.searchParams.set(
    "current",
    "temperature_2m",
  );
  weatherUrl.searchParams.set("timezone", "auto");

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 7_000);

  try {
    const [placeResult, weatherResult] =
      await Promise.allSettled([
        fetch(nominatimUrl, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Accept-Language": "ko,en",
            "User-Agent":
              process.env.NOMINATIM_USER_AGENT ??
              "SAN-route-app/1.0",
          },
          next: {
            revalidate: 3600,
          },
        }),
        fetch(weatherUrl, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
          next: {
            revalidate: 600,
          },
        }),
      ]);

    let place: NominatimResponse | null = null;
    let weather: WeatherResponse | null = null;

    if (
      placeResult.status === "fulfilled" &&
      placeResult.value.ok
    ) {
      place =
        (await placeResult.value.json()) as NominatimResponse;
    }

    if (
      weatherResult.status === "fulfilled" &&
      weatherResult.value.ok
    ) {
      weather =
        (await weatherResult.value.json()) as WeatherResponse;
    }

    const localName =
      firstNonEmpty(
        place?.address?.city,
        place?.address?.municipality,
        place?.address?.town,
        place?.address?.province,
        place?.address?.state,
        place?.address?.county,
        place?.address?.city_district,
        place?.name,
      ) ?? "현재 지역";

    const englishCandidate = firstNonEmpty(
      place?.namedetails?.["name:en"],
      KOREAN_REGION_ENGLISH[localName],
      place?.name,
      localName,
    );

    const englishName = cleanEnglishRegion(
      englishCandidate ?? localName,
    );

    const temperature =
      weather?.current?.temperature_2m;

    return NextResponse.json(
      {
        displayName:
          englishName.toLocaleUpperCase("en-US"),
        localName,
        temperature:
          typeof temperature === "number" &&
          Number.isFinite(temperature)
            ? Math.round(temperature)
            : null,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=600, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.error(
      "[REGION-SUMMARY] 조회 실패:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "지역 정보를 불러오는 중 오류가 발생했습니다.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}