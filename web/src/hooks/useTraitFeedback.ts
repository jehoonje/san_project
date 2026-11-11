"use client";

import { useCallback, useEffect, useState } from "react";

export type Reaction = "agree" | "disagree";

type FeedbackResponse = {
  fingerprint: string | null;
  feedback: { traitKey: string; reaction: Reaction }[];
};

// "이게 나야?" 반응: 리포트 지문 기준으로 저장되는 특징별 동의/비동의
export function useTraitFeedback(accessToken: string, enabled: boolean) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Reaction>>({});
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    fetch("/api/taste-feedback", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? (res.json() as Promise<FeedbackResponse>) : null))
      .then((data) => {
        if (!data || controller.signal.aborted) return;
        setFingerprint(data.fingerprint);
        setValues(
          Object.fromEntries(
            data.feedback.map((item) => [item.traitKey, item.reaction]),
          ),
        );
      })
      .catch(() => {
        // 반응 기능은 부가 기능: 실패해도 컬렉션은 그대로 보여줌
      });

    return () => controller.abort();
  }, [accessToken, enabled]);

  const react = useCallback(
    async (traitKey: string, reaction: Reaction) => {
      if (!fingerprint || pending) return;
      const previous = values[traitKey] ?? null;
      const next = previous === reaction ? null : reaction;

      setPending(traitKey);
      setValues((current) => {
        const copy = { ...current };
        if (next) copy[traitKey] = next;
        else delete copy[traitKey];
        return copy;
      });

      try {
        const res = await fetch("/api/taste-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ traitKey, reaction: next, fingerprint }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        // 실패 시 이전 값으로 되돌림
        setValues((current) => {
          const copy = { ...current };
          if (previous) copy[traitKey] = previous;
          else delete copy[traitKey];
          return copy;
        });
      } finally {
        setPending(null);
      }
    },
    [accessToken, fingerprint, pending, values],
  );

  return { ready: fingerprint !== null, values, pending, react };
}
