"use client";

import type {
  PlaceEvidenceSummary,
} from "@/types/analysis";

import {
  buildPlaceTraitPatterns,
  TRAIT_GROUP_LABELS,
  type PlaceTraitPattern,
} from "@/lib/placeTraits";

import {
  TraitFeedback,
  TraitFeedbackProvider,
  TraitFeedbackStatus,
} from "@/components/TraitFeedback";

type Props = {
  summary?: PlaceEvidenceSummary;
  accessToken: string;
  reportKey: string;
};

function choosePatterns(
  patterns: PlaceTraitPattern[],
): PlaceTraitPattern[] {
  const selected:
    PlaceTraitPattern[] = [];

  const specific = patterns.filter(
    (pattern) =>
      pattern.group !==
        "atmosphere" &&
      pattern.group !== "menu",
  );

  const atmosphere =
    patterns.filter(
      (pattern) =>
        pattern.group ===
        "atmosphere",
    );

  selected.push(
    ...specific.slice(0, 3),
  );

  if (selected.length < 3) {
    selected.push(
      ...atmosphere.slice(
        0,
        3 - selected.length,
      ),
    );
  }

  return selected;
}

function denominatorLabel(
  pattern: PlaceTraitPattern,
): string {
  if (
    pattern.group === "atmosphere"
  ) {
    return "분위기 정보가 있는 장소 기준";
  }

  if (
    pattern.key ===
      "interior.vintage" ||
    pattern.key ===
      "interior.minimal"
  ) {
    return "키워드 또는 분위기 정보가 있는 장소 기준";
  }

  return "키워드 정보가 있는 장소 기준";
}

export function PlaceTraitSection({
  summary,
  accessToken,
  reportKey,
}: Props) {
  const result =
    buildPlaceTraitPatterns(
      summary,
    );

  const patterns =
    choosePatterns(
      result.patterns,
    );

  if (
    patterns.length === 0
  ) {
    return null;
  }

  return (
    <TraitFeedbackProvider
      accessToken={accessToken}
      reportKey={reportKey}
    >
      <section
        className="place-traits"
        aria-labelledby="place-traits-title"
      >
        <style>{STYLES}</style>

        <header className="place-traits-heading">
          <span>
            공간에 남은 공통점
          </span>

          <h2 id="place-traits-title">
            다른 곳인데,
            <br />
            닮았네요.
          </h2>
        </header>

        <p className="place-traits-intro">
          {result.truncated
            ? "이번에 살펴본 장소에서 겹치는 특징을 골랐어요."
            : "이름은 달라도, 기록에 반복해서 남는 요소가 있어요."}
        </p>

        <div className="place-traits-list">
          {patterns.map(
            (pattern) => (
              <article
                key={pattern.key}
                className="place-traits-item"
              >
                <div className="place-traits-item-top">
                  <div>
                    <span className="place-traits-group">
                      {
                        TRAIT_GROUP_LABELS[
                          pattern.group
                        ]
                      }
                    </span>

                    <h3>
                      {pattern.label}
                    </h3>
                  </div>

                  <span className="place-traits-count">
                    {pattern.count}

                    <span>
                      /
                      {
                        pattern.eligibleCount
                      }
                      곳
                    </span>
                  </span>
                </div>

                <div
                  className="place-traits-track"
                  role="meter"
                  aria-label={`${pattern.label}이 확인된 장소 비율`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    pattern.percent
                  }
                  aria-valuetext={`${pattern.eligibleCount}곳 중 ${pattern.count}곳`}
                >
                  <div
                    style={{
                      width:
                        `${pattern.percent}%`,
                    }}
                  />
                </div>

                <p className="place-traits-denominator">
                  {denominatorLabel(
                    pattern,
                  )}
                </p>

                <details className="place-traits-evidence">
                  <summary>
                    {pattern.places
                      .slice(0, 2)
                      .map(
                        (place) =>
                          place.name,
                      )
                      .join(" · ")}

                    {pattern.places
                      .length > 2 &&
                      ` 외 ${
                        pattern.places
                          .length - 2
                      }곳`}
                  </summary>

                  <ul>
                    {pattern.places.map(
                      (place) => (
                        <li
                          key={
                            place.placeId
                          }
                        >
                          <div className="place-traits-place">
                            <span>
                              {
                                place.name
                              }
                            </span>

                            {place.regionDong && (
                              <small>
                                {
                                  place.regionDong
                                }
                              </small>
                            )}
                          </div>

                          <p>
                            {place.rawTerms.join(
                              " · ",
                            )}
                          </p>
                        </li>
                      ),
                    )}
                  </ul>
                </details>

                <TraitFeedback
                  traitKey={
                    pattern.key
                  }
                />
              </article>
            ),
          )}
        </div>

        <TraitFeedbackStatus />

        {result.truncated && (
          <p className="place-traits-scope">
            정보가 있는{" "}
            {
              result.enrichedUniquePlaces
            }
            곳 중{" "}
            {
              result.includedPlaces
            }
            곳을 살펴봤어요.
          </p>
        )}
      </section>
    </TraitFeedbackProvider>
  );
}

const STYLES = `
.place-traits {
  margin: 6px 0 24px;
  padding: 27px 23px;
  border: 1px solid transparent;
  border-radius:22px;
  background: var(--san-surface);
}

.place-traits-heading > span {
  color: var(--san-text);
  font-family: var(--san-font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: .2em;
  text-transform: uppercase;
}

.place-traits-heading h2 {
  margin-top: 12px;
  color: var(--san-text);
  font-size: clamp(30px, 8vw, 42px);
  font-weight:300;
  line-height: 1.2;
  letter-spacing:0;
}

.place-traits-intro {
  margin-top: 16px !important;
  color: var(--san-text);
  font-size: 12px;
  line-height: 1.9;
  word-break: keep-all;
}

.place-traits-list {
  display: grid;
  gap: 25px;
  margin-top: 28px;
}

.place-traits-item + .place-traits-item {
  padding-top: 23px;
  border-top: 1px solid transparent;
}

.place-traits-item-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.place-traits-group {
  color: var(--san-text);
  font-family: var(--san-font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: .2em;
  text-transform: uppercase;
}

.place-traits-item h3 {
  margin: 6px 0 0;
  color: var(--san-text);
  font-size: 20px;
  font-weight:300;
  line-height: 1.4;
  letter-spacing:0;
  overflow-wrap: anywhere;
}

.place-traits-count {
  flex-shrink: 0;
  color: var(--san-text);
  font-family: var(--san-font-mono);
  font-size: 23px;
  font-weight: 300;
  font-variant-numeric: tabular-nums;
}

.place-traits-count > span {
  margin-left: 3px;
  color: var(--san-text);
  font-size:11px;
}

.place-traits-track {
  height: 2px;
  overflow: hidden;
  margin-top: 13px;
  border-radius: 99px;
  background: var(--san-surface-strong);
}

.place-traits-track > div {
  height: 100%;
  border-radius: inherit;
  background: var(--san-text);
}

.place-traits-denominator {
  margin-top: 7px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.7;
}

.place-traits-evidence {
  margin-top: 9px;
}

.place-traits-evidence summary {
  min-height: 44px;
  padding: 12px 0;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.place-traits-evidence summary:focus-visible {
  outline: 1px solid var(--san-border-strong);
  outline-offset: 3px;
}

.place-traits-evidence ul {
  display: grid;
  gap: 13px;
  max-height: 240px;
  overflow-y: auto;
  margin-top: 5px !important;
  padding: 14px;
  border-radius:22px;
  background: var(--san-background);
  list-style: none;
}

.place-traits-place {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 5px 10px;
  color: var(--san-text);
  font-size: 11px;
  line-height: 1.7;
}

.place-traits-place small {
  color: var(--san-text);
  font-size:11px;
}

.place-traits-evidence li > p {
  margin-top: 4px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.place-traits-scope {
  margin-top: 19px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.9;
}

@media (min-width: 640px) {
  .place-traits {
    padding: 31px 32px;
  }

  .place-traits-item h3 {
    font-size: 22px;
  }
}
`;

export default PlaceTraitSection;