// web/src/app/api/nearby-places/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { PlaceCategory } from "@/types/place";

const KAKAO_CATEGORY_URL =
  "https://dapi.kakao.com/v2/local/search/category.json";

const KAKAO_KEYWORD_URL =
  "https://dapi.kakao.com/v2/local/search/keyword.json";

const SEARCH_RADIUS_METERS = 200;
const RESULT_LIMIT = 10;
const KAKAO_PAGE_SIZE = 15;

type KakaoPlaceDocument = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  category_group_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
};

type KakaoSearchResponse = {
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  documents: KakaoPlaceDocument[];
};

type NearbyPlace = {
  providerId: string;
  name: string;
  category: PlaceCategory;
  categoryName: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  address: string;
  phone: string | null;
  placeUrl: string;
};

type CategorySearch = {
  code: string;
  fallbackCategory: PlaceCategory;
};

const CATEGORY_SEARCHES: CategorySearch[] = [
  {
    code: "CE7",
    fallbackCategory: "cafe",
  },
  {
    code: "FD6",
    fallbackCategory: "restaurant",
  },
  {
    code: "CT1",
    fallbackCategory: "culture",
  },
  {
    code: "AT4",
    fallbackCategory: "etc",
  },
  {
    code: "MT1",
    fallbackCategory: "shop",
  },
  {
    code: "CS2",
    fallbackCategory: "shop",
  },
];

function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function inferFoodCategory(
  categoryName: string,
): PlaceCategory {
  const normalized = categoryName.toLowerCase();

  const barKeywords = [
    "술집",
    "호프",
    "맥주",
    "와인",
    "칵테일",
    "요리주점",
    "일본식주점",
    "포장마차",
    "bar",
  ];

  const isBar = barKeywords.some((keyword) =>
    normalized.includes(keyword),
  );

  return isBar ? "bar" : "restaurant";
}

function inferTourCategory(
  categoryName: string,
): PlaceCategory {
  const parkKeywords = [
    "공원",
    "근린공원",
    "도시공원",
    "수목원",
    "생태공원",
    "산책로",
  ];

  if (
    parkKeywords.some((keyword) =>
      categoryName.includes(keyword),
    )
  ) {
    return "park";
  }

  const cultureKeywords = [
    "박물관",
    "미술관",
    "전시",
    "공연",
    "극장",
    "문화",
    "도서관",
  ];

  if (
    cultureKeywords.some((keyword) =>
      categoryName.includes(keyword),
    )
  ) {
    return "culture";
  }

  return "etc";
}

function resolveCategory(
  document: KakaoPlaceDocument,
  fallbackCategory: PlaceCategory,
): PlaceCategory {
  if (document.category_group_code === "FD6") {
    return inferFoodCategory(document.category_name);
  }

  if (document.category_group_code === "AT4") {
    return inferTourCategory(document.category_name);
  }

  return fallbackCategory;
}

function convertPlace(
  document: KakaoPlaceDocument,
  fallbackCategory: PlaceCategory,
): NearbyPlace | null {
  const lat = Number(document.y);
  const lng = Number(document.x);
  const distanceMeters = Number(document.distance);

  if (
    !isValidLatitude(lat) ||
    !isValidLongitude(lng) ||
    !Number.isFinite(distanceMeters)
  ) {
    return null;
  }

  return {
    providerId: document.id,
    name: document.place_name,
    category: resolveCategory(
      document,
      fallbackCategory,
    ),
    categoryName: document.category_name,
    lat,
    lng,
    distanceMeters,
    address:
      document.road_address_name ||
      document.address_name,
    phone: document.phone || null,
    placeUrl: document.place_url,
  };
}

async function requestKakao(
  url: URL,
  restApiKey: string,
): Promise<KakaoPlaceDocument[]> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `KakaoAK ${restApiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text();

    console.error("[NEARBY_PLACES] 카카오 API 오류:", {
      status: response.status,
      body: responseText,
    });

    throw new Error(
      `카카오 장소 검색 실패 (${response.status})`,
    );
  }

  const data =
    (await response.json()) as KakaoSearchResponse;

  return data.documents;
}

async function searchCategory(
  lat: number,
  lng: number,
  search: CategorySearch,
  restApiKey: string,
): Promise<NearbyPlace[]> {
  const url = new URL(KAKAO_CATEGORY_URL);

  url.searchParams.set(
    "category_group_code",
    search.code,
  );
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set(
    "radius",
    String(SEARCH_RADIUS_METERS),
  );
  url.searchParams.set(
    "size",
    String(KAKAO_PAGE_SIZE),
  );
  url.searchParams.set("sort", "distance");

  const documents = await requestKakao(
    url,
    restApiKey,
  );

  return documents
    .map((document) =>
      convertPlace(
        document,
        search.fallbackCategory,
      ),
    )
    .filter(
      (place): place is NearbyPlace =>
        place !== null,
    );
}

async function searchPark(
  lat: number,
  lng: number,
  restApiKey: string,
): Promise<NearbyPlace[]> {
  const url = new URL(KAKAO_KEYWORD_URL);

  url.searchParams.set("query", "공원");
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set(
    "radius",
    String(SEARCH_RADIUS_METERS),
  );
  url.searchParams.set(
    "size",
    String(KAKAO_PAGE_SIZE),
  );
  url.searchParams.set("sort", "distance");

  const documents = await requestKakao(
    url,
    restApiKey,
  );

  return documents
    .map((document) =>
      convertPlace(document, "park"),
    )
    .filter(
      (place): place is NearbyPlace =>
        place !== null,
    )
    .map((place) => ({
      ...place,
      category: "park" as const,
    }));
}

export async function GET(request: NextRequest) {
  const restApiKey =
    process.env.KAKAO_REST_API_KEY;

  if (!restApiKey) {
    console.error(
      "[NEARBY_PLACES] KAKAO_REST_API_KEY가 없습니다.",
    );

    return NextResponse.json(
      {
        message:
          "서버의 장소 검색 설정이 완료되지 않았습니다.",
      },
      {
        status: 500,
      },
    );
  }

  const lat = Number(
    request.nextUrl.searchParams.get("lat"),
  );
  const lng = Number(
    request.nextUrl.searchParams.get("lng"),
  );

  if (
    !isValidLatitude(lat) ||
    !isValidLongitude(lng)
  ) {
    return NextResponse.json(
      {
        message: "올바른 현재 위치가 필요합니다.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const categoryRequests = CATEGORY_SEARCHES.map(
      (search) =>
        searchCategory(
          lat,
          lng,
          search,
          restApiKey,
        ),
    );

    const results = await Promise.all([
      ...categoryRequests,
      searchPark(lat, lng, restApiKey),
    ]);

    const uniquePlaces = new Map<
      string,
      NearbyPlace
    >();

    for (const place of results.flat()) {
      const existing = uniquePlaces.get(
        place.providerId,
      );

      if (
        !existing ||
        place.distanceMeters <
          existing.distanceMeters
      ) {
        uniquePlaces.set(
          place.providerId,
          place,
        );
      }
    }

    const places = [...uniquePlaces.values()]
      .filter(
        (place) =>
          place.distanceMeters <=
          SEARCH_RADIUS_METERS,
      )
      .sort(
        (a, b) =>
          a.distanceMeters - b.distanceMeters,
      )
      .slice(0, RESULT_LIMIT);

    console.log("[NEARBY_PLACES] 검색 완료:", {
      lat,
      lng,
      radiusMeters: SEARCH_RADIUS_METERS,
      totalMerged: uniquePlaces.size,
      returned: places.length,
    });

    return NextResponse.json({
      center: {
        lat,
        lng,
      },
      radiusMeters: SEARCH_RADIUS_METERS,
      places,
    });
  } catch (error) {
    console.error(
      "[NEARBY_PLACES] 장소 검색 실패:",
      error,
    );

    return NextResponse.json(
      {
        message:
          "주변 장소를 불러오지 못했습니다.",
      },
      {
        status: 502,
      },
    );
  }
}