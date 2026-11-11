// web/src/lib/tasteProfile.ts
// 취향 데이터 요청: 통계는 즉시, 장소 정보 보강과 AI 해석은 뒤에서.
import type {
  MissingInsightPlace,
  PersonalReport,
  PlaceAnalysisStats,
} from "@/types/analysis";
import type { ComparisonReportResponse } from "@/types/comparison";

export type TasteSnapshot = {
  stats: PlaceAnalysisStats;
  report: PersonalReport | null;
  generatedAt: string | null;
  missing: MissingInsightPlace[];
};

export type HttpError = Error & { status?: number };

const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

// 같은 세션 안에서 컬렉션 화면과 신호 기능이 같은 응답을 나눠 씀
let cached: { token: string; at: number; value: TasteSnapshot } | null = null;
let inflight: { token: string; promise: Promise<TasteSnapshot> } | null = null;

async function parse<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      value &&
      typeof value === "object" &&
      "error" in value &&
      typeof (value as { error: unknown }).error === "string"
        ? (value as { error: string }).error
        : "request_failed";
    const error = new Error(code) as HttpError;
    error.status = response.status;
    throw error;
  }
  if (value === null || value === undefined) throw new Error("empty_response");
  return value as T;
}

function headers(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function isAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function peekSnapshot(token: string): TasteSnapshot | null {
  if (!cached || cached.token !== token) return null;
  return cached.value;
}

export function rememberSnapshot(token: string, value: TasteSnapshot) {
  cached = { token, at: Date.now(), value };
}

// 빠른 첫 응답: 통계 + 직전 리포트 (Gemini 호출 없음)
// 여러 화면이 같은 요청을 나눠 쓰므로 취소 신호는 걸지 않음 (결과만 각자 버림)
export async function fetchSnapshot(
  token: string,
  options: { fresh?: boolean } = {},
): Promise<TasteSnapshot> {
  if (
    !options.fresh &&
    cached &&
    cached.token === token &&
    Date.now() - cached.at < SNAPSHOT_TTL_MS
  ) {
    return cached.value;
  }
  if (!options.fresh && inflight?.token === token) return inflight.promise;

  const promise = (async () => {
    const data = await parse<ComparisonReportResponse>(
      await fetch("/api/analysis-report", {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ statsOnly: true }),
      }),
    );
    const value: TasteSnapshot = {
      stats: data.analysis,
      report: data.report,
      generatedAt: data.generatedAt,
      missing: data.missingPlaces ?? [],
    };
    rememberSnapshot(token, value);
    return value;
  })();

  inflight = { token, promise };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

// 정보가 없는 장소를 동시에 3곳씩 보강. 한도(429)에 걸리면 멈추고 있는 정보로 진행
export async function enrichPlaces(
  token: string,
  places: MissingInsightPlace[],
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
) {
  let next = 0;
  let done = 0;
  let stopped = false;

  const worker = async () => {
    while (!signal.aborted && !stopped && next < places.length) {
      const place = places[next++];
      try {
        await parse<unknown>(
          await fetch("/api/place-insight", {
            method: "POST",
            headers: headers(token),
            signal,
            body: JSON.stringify(place),
          }),
        );
      } catch (error) {
        if (signal.aborted || isAbort(error)) throw error;
        const status = (error as HttpError).status;
        if (status === 401 || status === 403 || status === 429) {
          stopped = true;
          return;
        }
        console.error("장소 정보 보강 실패:", place.name, error);
      }
      done += 1;
      onProgress(done, places.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(3, places.length) }, () => worker()),
  );
  if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
  return { stopped };
}

// AI 해석(취향 이름·요약·다음 신호). 지문이 같으면 서버 캐시로 즉시 응답
export async function fetchReading(
  token: string,
  options: { force: boolean; signal: AbortSignal },
): Promise<ComparisonReportResponse> {
  return parse<ComparisonReportResponse>(
    await fetch("/api/analysis-report", {
      method: "POST",
      headers: headers(token),
      signal: options.signal,
      body: JSON.stringify({ force: options.force, allowPartial: true }),
    }),
  );
}
