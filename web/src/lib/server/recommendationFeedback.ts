import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  buildPlaceTraitPatterns,
} from "@/lib/placeTraits";

import type {
  PlaceAnalysisStats,
} from "@/types/analysis";

export type RecommendationFeedbackItem = {
  traitKey: string;

  /**
   * 현재 분석에서 특징을 찾을 수 있을 때만 채웁니다.
   */
  label: string | null;

  reaction: "agree" | "disagree";

  /**
   * 현재 분석 입력에서도 확인되는 특징인지 여부.
   */
  presentInCurrentEvidence: boolean;

  /**
   * 현재 분석 입력에 포함된 서로 다른 근거 장소 수.
   */
  evidencePlaceCount: number;

  updatedAt: string;
};

export type RecommendationFeedback = {
  version: "recommendation-feedback-v1";

  items: RecommendationFeedbackItem[];
};

export type FeedbackAwareAnalysis =
  PlaceAnalysisStats & {
    recommendationFeedback?: RecommendationFeedback;
  };

const MAX_FEEDBACK_ITEMS = 100;

function isReaction(
  value: unknown,
): value is "agree" | "disagree" {
  return (
    value === "agree" ||
    value === "disagree"
  );
}

export async function fetchRecommendationFeedback(
  admin: SupabaseClient,
  userId: string,
  analysis: PlaceAnalysisStats,
): Promise<RecommendationFeedback> {
  const { data, error } = await admin
    .from("taste_trait_feedback")
    .select(
      "trait_key, reaction, updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", {
      ascending: false,
    })
    .order("trait_key", {
      ascending: true,
    })
    .limit(MAX_FEEDBACK_ITEMS);

  if (error) throw error;

  const patterns =
    buildPlaceTraitPatterns(
      analysis.placeEvidence,
    ).patterns;

  const patternByKey = new Map(
    patterns.map((pattern) => [
      pattern.key,
      pattern,
    ]),
  );

  const items: RecommendationFeedbackItem[] = [];

  for (const row of data ?? []) {
    if (
      typeof row.trait_key !== "string" ||
      !isReaction(row.reaction) ||
      typeof row.updated_at !== "string"
    ) {
      continue;
    }

    const pattern = patternByKey.get(
      row.trait_key,
    );

    items.push({
      traitKey: row.trait_key,
      label: pattern?.label ?? null,
      reaction: row.reaction,
      presentInCurrentEvidence:
        Boolean(pattern),
      evidencePlaceCount:
        pattern?.count ?? 0,
      updatedAt: row.updated_at,
    });
  }

  // 동일한 데이터라면 입력 순서도 동일하게 유지합니다.
  items.sort((a, b) =>
    a.traitKey.localeCompare(b.traitKey),
  );

  return {
    version:
      "recommendation-feedback-v1",
    items,
  };
}