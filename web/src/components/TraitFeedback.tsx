"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Reaction = "agree" | "disagree";

type FeedbackResponse = {
  fingerprint: string | null;

  feedback: {
    traitKey: string;
    reaction: Reaction;
  }[];
};

type SaveResponse = {
  traitKey: string;
  reaction: Reaction | null;
};

type FeedbackContextValue = {
  loaded: boolean;
  available: boolean;
  loadError: string;

  values: Record<string, Reaction>;
  pending: Record<string, boolean>;
  errors: Record<string, string>;

  reload: () => void;

  save: (
    traitKey: string,
    reaction: Reaction | null,
  ) => Promise<void>;
};

const FeedbackContext =
  createContext<
    FeedbackContextValue | undefined
  >(undefined);

async function readResponse<T>(
  response: Response,
): Promise<T> {
  const data: unknown = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const code =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "feedback_failed";

    throw new Error(code);
  }

  if (!data) {
    throw new Error(
      "empty_response",
    );
  }

  return data as T;
}

function saveErrorMessage(
  error: unknown,
): string {
  const code =
    error instanceof Error
      ? error.message
      : "";

  switch (code) {
    case "report_changed":
      return "보고서가 바뀌었어요. 분석 화면을 다시 열어주세요.";

    case "unauthorized":
      return "다시 로그인해주세요.";

    case "trait_not_found":
      return "현재 보고서에서 이 특징을 찾지 못했어요.";

    case "report_not_found":
      return "보고서를 먼저 불러와주세요.";

    default:
      return "저장하지 못했어요. 다시 눌러주세요.";
  }
}

export function TraitFeedbackProvider({
  accessToken,
  reportKey,
  children,
}: {
  accessToken: string;
  reportKey: string;
  children: ReactNode;
}) {
  const [loaded, setLoaded] =
    useState(false);

  const [
    fingerprint,
    setFingerprint,
  ] = useState<string | null>(null);

  const [values, setValues] =
    useState<
      Record<string, Reaction>
    >({});

  const [pending, setPending] =
    useState<
      Record<string, boolean>
    >({});

  const [errors, setErrors] =
    useState<
      Record<string, string>
    >({});

  const [loadError, setLoadError] =
    useState("");

  const [reloadKey, setReloadKey] =
    useState(0);

  const generation = useRef(0);

  const controllers = useRef(
    new Set<AbortController>(),
  );

  const pendingKeys = useRef(
    new Set<string>(),
  );

  const reload = useCallback(() => {
    setReloadKey(
      (previous) => previous + 1,
    );
  }, []);

  useEffect(() => {
    const id = ++generation.current;

    const controller =
      new AbortController();

    setLoaded(false);
    setFingerprint(null);
    setValues({});
    setPending({});
    setErrors({});
    setLoadError("");

    const load = async () => {
      try {
        const result =
          await readResponse<
            FeedbackResponse
          >(
            await fetch(
              "/api/taste-feedback",
              {
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                },
                signal:
                  controller.signal,
                cache: "no-store",
              },
            ),
          );

        if (
          controller.signal.aborted ||
          id !== generation.current
        ) {
          return;
        }

        setFingerprint(
          result.fingerprint,
        );

        setValues(
          Object.fromEntries(
            result.feedback.map(
              (item) => [
                item.traitKey,
                item.reaction,
              ],
            ),
          ),
        );
      } catch (error) {
        if (
          controller.signal.aborted ||
          id !== generation.current
        ) {
          return;
        }

        console.error(
          "취향 피드백 조회 실패:",
          error,
        );

        const code =
          error instanceof Error
            ? error.message
            : "";

        setLoadError(
          code === "unauthorized"
            ? "반응을 남기려면 다시 로그인해주세요."
            : "저장한 반응을 불러오지 못했어요.",
        );
      } finally {
        if (
          !controller.signal.aborted &&
          id === generation.current
        ) {
          setLoaded(true);
        }
      }
    };

    void load();

    return () => {
      generation.current += 1;
      controller.abort();

      for (
        const active of
        controllers.current
      ) {
        active.abort();
      }

      controllers.current.clear();
      pendingKeys.current.clear();
    };
  }, [
    accessToken,
    reportKey,
    reloadKey,
  ]);

  const save = useCallback(
    async (
      traitKey: string,
      reaction: Reaction | null,
    ) => {
      if (
        !fingerprint ||
        pendingKeys.current.has(
          traitKey,
        )
      ) {
        return;
      }

      const id = generation.current;

      const controller =
        new AbortController();

      controllers.current.add(
        controller,
      );

      pendingKeys.current.add(
        traitKey,
      );

      setPending((previous) => ({
        ...previous,
        [traitKey]: true,
      }));

      setErrors((previous) => ({
        ...previous,
        [traitKey]: "",
      }));

      try {
        const result =
          await readResponse<
            SaveResponse
          >(
            await fetch(
              "/api/taste-feedback",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization:
                    `Bearer ${accessToken}`,
                },
                signal:
                  controller.signal,
                body: JSON.stringify({
                  traitKey,
                  reaction,
                  fingerprint,
                }),
              },
            ),
          );

        if (
          controller.signal.aborted ||
          id !== generation.current
        ) {
          return;
        }

        setValues((previous) => {
          const next = {
            ...previous,
          };

          if (
            result.reaction === null
          ) {
            delete next[traitKey];
          } else {
            next[traitKey] =
              result.reaction;
          }

          return next;
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          id !== generation.current
        ) {
          return;
        }

        setErrors((previous) => ({
          ...previous,
          [traitKey]:
            saveErrorMessage(error),
        }));
      } finally {
        controllers.current.delete(
          controller,
        );

        if (
          id === generation.current
        ) {
          pendingKeys.current.delete(
            traitKey,
          );

          setPending((previous) => ({
            ...previous,
            [traitKey]: false,
          }));
        }
      }
    },
    [accessToken, fingerprint],
  );

  return (
    <FeedbackContext.Provider
      value={{
        loaded,
        available:
          Boolean(fingerprint),
        loadError,
        values,
        pending,
        errors,
        reload,
        save,
      }}
    >
      <style>{STYLES}</style>
      {children}
    </FeedbackContext.Provider>
  );
}

export function TraitFeedbackStatus() {
  const context =
    useContext(FeedbackContext);

  if (
    !context ||
    !context.loadError
  ) {
    return null;
  }

  return (
    <div
      className="trait-feedback-load-error"
      role="status"
    >
      <p>{context.loadError}</p>

      <button
        type="button"
        onClick={context.reload}
      >
        다시 불러오기
      </button>
    </div>
  );
}

export function TraitFeedback({
  traitKey,
}: {
  traitKey: string;
}) {
  const context =
    useContext(FeedbackContext);

  if (
    !context ||
    !context.loaded ||
    !context.available
  ) {
    return null;
  }

  const selected =
    context.values[traitKey] ??
    null;

  const saving =
    context.pending[traitKey] ??
    false;

  const error =
    context.errors[traitKey] ??
    "";

  const choose = (
    reaction: Reaction,
  ) => {
    void context.save(
      traitKey,
      selected === reaction
        ? null
        : reaction,
    );
  };

  return (
    <div className="trait-feedback">
      <span>
        내 취향과 가까워요?
      </span>

      <div
        className="trait-feedback-buttons"
        role="group"
        aria-label="취향 해석에 대한 반응"
      >
        <button
          type="button"
          disabled={saving}
          aria-pressed={
            selected === "agree"
          }
          onClick={() =>
            choose("agree")
          }
        >
          맞아요
        </button>

        <button
          type="button"
          disabled={saving}
          aria-pressed={
            selected === "disagree"
          }
          onClick={() =>
            choose("disagree")
          }
        >
          조금 달라요
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
      >
        {error ||
          (saving
            ? "저장 중이에요."
            : selected
              ? "저장했어요. 다시 누르면 취소돼요."
              : "")}
      </p>
    </div>
  );
}

const STYLES = `
.trait-feedback {
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px solid transparent;
}

.trait-feedback > span {
  color: var(--san-text);
  font-size:11px;
}

.trait-feedback-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 8px;
}

.trait-feedback-buttons button {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 99px;
  background: var(--san-background);
  color: var(--san-text);
  font-size: 12.5px;
  transition: background-color 460ms cubic-bezier(0.22, 1, 0.36, 1), color 460ms cubic-bezier(0.22, 1, 0.36, 1);
}

.trait-feedback-buttons
button[aria-pressed="true"] {
  background: var(--san-accent);
  color: var(--san-accent-text);
}

.trait-feedback-buttons button:disabled {
  opacity: .5;
  cursor: wait;
}

.trait-feedback-buttons button:focus-visible,
.trait-feedback-load-error button:focus-visible {
  outline: 1px solid var(--san-border-strong);
  outline-offset: 3px;
}

.trait-feedback > p {
  margin-top: 7px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
}

.trait-feedback > p:empty {
  display: none;
}

.trait-feedback-load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 12px;
  margin-top: 18px;
}

.trait-feedback-load-error p {
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
}

.trait-feedback-load-error button {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 99px;
  background: var(--san-background);
  color: var(--san-text);
  font-size:11px;
}
`;