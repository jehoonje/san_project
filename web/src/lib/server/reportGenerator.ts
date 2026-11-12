import { GoogleGenAI } from "@google/genai";

import type {
  PersonalReport,
  PlaceAnalysisStats,
} from "@/types/analysis";

import type {
  ComparisonData,
} from "@/types/comparison";

import {
  buildReportPrompt,
} from "@/lib/server/reportPrompt";

const GENERATION_BUDGET_MS = 35_000;
const MAX_ATTEMPTS = 2;

const FIELDS = [
  "title",
  "summary",
  "identity",
  "categoryPreference",
  "areaPreference",
  "timePattern",
  "moodAndSpending",
  "favoriteMenus",
  "caveat",
] as const;

const SCHEMA = {
  type: "object",

  properties: {
    ...Object.fromEntries(
      FIELDS.map((key) => [
        key,
        {
          type: "string",
        },
      ]),
    ),

    recommendations: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 3,
      maxItems: 3,
    },
  },

  required: [
    ...FIELDS,
    "recommendations",
  ],
};

export type ReportGenerationErrorCode =
  | "report_timeout"
  | "report_invalid"
  | "report_rate_limited"
  | "report_provider_failed"
  | "report_configuration_missing";

export class ReportGenerationError
  extends Error {
  readonly code: ReportGenerationErrorCode;

  constructor(
    code: ReportGenerationErrorCode,
    message: string,
  ) {
    super(message);

    this.name = "ReportGenerationError";
    this.code = code;
  }
}

class InvalidReportError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "InvalidReportError";
  }
}

export function sanitizeReport(
  raw: unknown,
): PersonalReport {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    throw new InvalidReportError(
      "Report must be an object",
    );
  }

  const value =
    raw as Record<string, unknown>;

  for (const field of FIELDS) {
    if (typeof value[field] !== "string") {
      throw new InvalidReportError(
        `Report field must be a string: ${field}`,
      );
    }
  }

  const text = (
    key: string,
    max = 300,
  ): string => {
    return (value[key] as string)
      .trim()
      .slice(0, max);
  };

  if (
    !Array.isArray(value.recommendations) ||
    !value.recommendations.every(
      (item) => typeof item === "string",
    )
  ) {
    throw new InvalidReportError(
      "Recommendations must be strings",
    );
  }

  const recommendations = [
    ...new Set(
      value.recommendations
        .map((item: string) =>
          item.trim().slice(0, 100),
        )
        .filter(Boolean),
    ),
  ];

  if (recommendations.length !== 3) {
    throw new InvalidReportError(
      "Three distinct recommendations are required",
    );
  }

  const report: PersonalReport = {
    title: text("title", 60),
    summary: text("summary", 500),
    identity: text("identity"),

    categoryPreference: text(
      "categoryPreference",
    ),

    areaPreference: text(
      "areaPreference",
    ),

    timePattern: text("timePattern"),

    moodAndSpending: text(
      "moodAndSpending",
    ),

    favoriteMenus: text("favoriteMenus"),

    recommendations,
    caveat: "",
  };

  if (
    !report.title ||
    !report.summary ||
    !report.identity
  ) {
    throw new InvalidReportError(
      "Required report content is missing",
    );
  }

  return report;
}

function parseReport(
  response: unknown,
): PersonalReport {
  if (
    !response ||
    typeof response !== "object"
  ) {
    throw new InvalidReportError(
      "Provider response is missing",
    );
  }

  const result =
    response as Record<string, unknown>;

  if (
    typeof result.output_text !== "string"
  ) {
    throw new InvalidReportError(
      "Provider output_text is missing",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(result.output_text);
  } catch {
    throw new InvalidReportError(
      "Provider output is not valid JSON",
    );
  }

  return sanitizeReport(parsed);
}

function providerStatus(
  error: unknown,
): number | null {
  if (
    !error ||
    typeof error !== "object"
  ) {
    return null;
  }

  const value =
    error as Record<string, unknown>;

  for (const key of [
    "status",
    "statusCode",
    "code",
  ]) {
    const candidate = value[key];

    if (
      typeof candidate !== "number" &&
      typeof candidate !== "string"
    ) {
      continue;
    }

    const status = Number(candidate);

    if (
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
    ) {
      return status;
    }
  }

  return null;
}

/**
 * 애플리케이션이 응답을 기다리는 시간을 제한합니다.
 *
 * 이 함수 자체가 이미 전송된 외부 요청을 취소하지는 않습니다.
 * 타임아웃이 발생하면 재시도하지 않습니다.
 */
async function withinDeadline<T>(
  operation: () => Promise<T>,
  deadline: number,
): Promise<T> {
  const remaining =
    deadline - Date.now();

  if (remaining <= 0) {
    throw new ReportGenerationError(
      "report_timeout",
      "Report generation deadline exceeded",
    );
  }

  let timer:
    | ReturnType<typeof setTimeout>
    | undefined;

  try {
    return await Promise.race([
      Promise.resolve().then(operation),

      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ReportGenerationError(
              "report_timeout",
              "Report generation deadline exceeded",
            ),
          );
        }, remaining);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

type GenerateReportOptions = {
  model: string;
  analysis: PlaceAnalysisStats;
  comparison: ComparisonData;
  missingCount: number;
};

export async function generateReport({
  model,
  analysis,
  comparison,
  missingCount,
}: GenerateReportOptions): Promise<PersonalReport> {
  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ReportGenerationError(
      "report_configuration_missing",
      "GEMINI_API_KEY is missing",
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  const basePrompt = buildReportPrompt(
    analysis,
    comparison,
    missingCount,
  );

  const deadline =
    Date.now() + GENERATION_BUDGET_MS;

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt += 1
  ) {
    const input =
      attempt === 0
        ? basePrompt
        : [
            basePrompt,
            "",
            "[출력 형식 재확인]",
            "이전 응답이 JSON 또는 필수 필드 검증을 통과하지 못했습니다.",
            "같은 입력 데이터만 사용하여 다시 작성하세요.",
            "필수 문자열 필드를 모두 포함하세요.",
            "recommendations는 서로 다른 비어 있지 않은 문자열 3개입니다.",
            "JSON 객체 외의 텍스트는 출력하지 마세요.",
          ].join("\n");

    try {
      const response =
        await withinDeadline(
          async () => {
            return ai.interactions.create({
              model,
              input,

              response_format: {
                type: "text",
                mime_type:
                  "application/json",
                schema: SCHEMA,
              },
            } as never);
          },
          deadline,
        );

      return parseReport(response);
    } catch (error) {
      if (
        error instanceof
        ReportGenerationError
      ) {
        throw error;
      }

      if (
        error instanceof
        InvalidReportError
      ) {
        const canRetry =
          attempt + 1 < MAX_ATTEMPTS &&
          Date.now() < deadline;

        if (canRetry) continue;

        throw new ReportGenerationError(
          "report_invalid",
          error.message,
        );
      }

      const status =
        providerStatus(error);

      console.error(
        "보고서 생성 공급자 오류:",
        error,
      );

      if (status === 429) {
        throw new ReportGenerationError(
          "report_rate_limited",
          "Report provider rate limit reached",
        );
      }

      throw new ReportGenerationError(
        "report_provider_failed",
        "Report provider request failed",
      );
    }
  }

  throw new ReportGenerationError(
    "report_invalid",
    "Report generation attempts exhausted",
  );
}