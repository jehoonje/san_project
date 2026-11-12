"use client";

import { useId } from "react";
import type { PersonalReport, PlaceAnalysisStats } from "@/types/analysis";
import type { ComparisonData, ComparisonRow } from "@/types/comparison";

export const finitePercent = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

export function StorySectionStyles() {
  return <style>{STYLES}</style>;
}

export function IdentitySection({ report }: { report: PersonalReport }) {
  const id = useId();
  if (!report.identity.trim()) return null;
  return (
    <section className="rs-identity" aria-labelledby={id}>
      <span className="rs-eyebrow">이런 쪽에 마음이 가요.</span>
      <p className="rs-large-copy">{report.identity}</p>
    </section>
  );
}

type UsableRow = ComparisonRow & { mine: number; peers: number };
function comparisonRows(data?: ComparisonData): UsableRow[] {
  return (data?.categories ?? [])
    .filter(
      (r): r is UsableRow =>
        typeof r.mine === "number" &&
        Number.isFinite(r.mine) &&
        typeof r.peers === "number" &&
        Number.isFinite(r.peers) &&
        (r.mine > 0 || r.peers > 0),
    )
    .sort(
      (a, b) =>
        Math.abs(b.mine - b.peers) - Math.abs(a.mine - a.peers) ||
        b.mine - a.mine,
    )
    .slice(0, 2);
}

export function PeerSection({
  copy,
  comparison,
}: {
  copy: string;
  comparison?: ComparisonData;
}) {
  const id = useId();
  const rows = comparisonRows(comparison);
  if (!copy.trim() && !rows.length) return null;
  return (
    <section className="rs-panel rs-peers" aria-labelledby={id}>
      <span className="rs-eyebrow">다른 유저의 기록과 나란히</span>
      <h2 id={id}>닮았을까요?</h2>
      {copy.trim() && <p className="rs-copy">{copy}</p>}
      {rows.length > 0 && (
        <div className="rs-peer-rows">
          {rows.map((row) => {
            const delta = row.mine - row.peers;
            return (
              <article key={row.id}>
                <div className="rs-row-head">
                  <h3>{row.label}</h3>
                  <span>
                    {Math.abs(delta) < 5
                      ? "비슷한 비중"
                      : delta > 0
                        ? "나는 이쪽 비중이 더 커요"
                        : "나는 이쪽 비중이 더 작아요"}
                  </span>
                </div>
                <div className="rs-bar-line">
                  <span>나</span>
                  <div className="rs-track" aria-hidden="true">
                    <i style={{ width: `${finitePercent(row.mine)}%` }} />
                  </div>
                  <span>{finitePercent(row.mine)}%</span>
                </div>
                <div className="rs-bar-line">
                  <span>유저</span>
                  <div className="rs-track rs-track-peer" aria-hidden="true">
                    <i style={{ width: `${finitePercent(row.peers)}%` }} />
                  </div>
                  <span>{finitePercent(row.peers)}%</span>
                </div>
              </article>
            );
          })}
          <p className="rs-note">
            나는 최근 완료된 30일, 다른 유저는 그보다 이전 90일의 기록
            비중이에요. 앱 유저 기록의 비교예요.
          </p>
        </div>
      )}
    </section>
  );
}

export function TrendSection({
  copy,
  comparison,
}: {
  copy: string;
  comparison?: ComparisonData;
}) {
  const id = useId();
  const rising = (comparison?.categories ?? [])
    .filter(
      (row) =>
        typeof row.trend === "number" &&
        Number.isFinite(row.trend) &&
        typeof row.change === "number" &&
        Number.isFinite(row.change) &&
        row.change >= 5,
    )
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
    .slice(0, 1);
  if (!copy.trim() && !rising.length) return null;
  return (
    <section className="rs-panel rs-trend" aria-labelledby={id}>
      <span className="rs-eyebrow">요즘 앱에 남는 선택</span>
      <h2 id={id}>
        그 흐름 속에서,
        <br />내 기록은
      </h2>
      {copy.trim() && <p className="rs-copy">{copy}</p>}
      {rising.map((row) => (
        <div className="rs-trend-signal" key={row.id}>
          <div>
            <span>다른 유저 기록에서 비중이 늘어난 선택</span>
            <h3>{row.label}</h3>
          </div>
          <span className="rs-change">+{row.change}%p</span>
          <p className="rs-note">
            직전 30일 대비 최근 완료된 30일의 차이예요. 내 기록의 변화는
            아니에요.
          </p>
        </div>
      ))}
    </section>
  );
}

export function CharmSection({ copy }: { copy: string }) {
  const id = useId();
  if (!copy.trim()) return null;
  return (
    <section className="rs-charm" aria-labelledby={id}>
      <span className="rs-eyebrow">기록에서 눈에 띈 면</span>
      <h2 id={id}>기록에 남은 결</h2>
      <p className="rs-large-copy">{copy}</p>
    </section>
  );
}

export function RegionSection({
  stats,
  copy,
}: {
  stats: PlaceAnalysisStats;
  copy: string;
}) {
  const id = useId();
  const regions = [...stats.regions]
    .filter((r) => Number.isFinite(r.count) && r.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);
  if (!copy.trim() && !regions.length) return null;
  const top = regions[0];
  return (
    <section className="rs-region" aria-labelledby={id}>
      <span className="rs-eyebrow">자주 머문 동네</span>
      <h2 id={id}>{top?.label ?? "기록이 모인 동네"}</h2>
      {copy.trim() && <p className="rs-copy">{copy}</p>}
      {regions.length > 0 && (
        <ol className="rs-regions">
          {regions.map((region, index) => {
            const percent =
              stats.totalVisits > 0
                ? Math.round((region.count / stats.totalVisits) * 100)
                : 0;
            return (
              <li key={region.key}>
                <div className="rs-region-label">
                  <span className="rs-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{region.label}</span>
                  <small>{region.count}건</small>
                </div>
                <div
                  className="rs-track rs-track-region"
                  role="meter"
                  aria-label={`${region.label} 기록 비중`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={finitePercent(percent)}
                  aria-valuetext={`전체 저장 기록 ${stats.totalVisits}건 중 ${region.count}건`}
                >
                  <i style={{ width: `${finitePercent(percent)}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {regions.length > 0 && (
        <p className="rs-note">
          전체 저장 기록 기준이에요. 지역 정보가 없는 기록도 전체 건수에
          포함돼요.
        </p>
      )}
    </section>
  );
}

export function NextStepsSection({ items }: { items: string[] }) {
  const id = useId();
  const clean = [
    ...new Set(items.map((item) => item.trim()).filter(Boolean)),
  ].slice(0, 3);
  if (!clean.length) return null;
  return (
    <section className="rs-next" aria-labelledby={id}>
      <span className="rs-eyebrow">다음 선택을 위한 힌트</span>
      <h2 id={id}>
        이번엔,
        <br />
        하나만 바꿔볼까요.
      </h2>
      <ol>
        {clean.map((item, index) => (
          <li key={item}>
            <span className="rs-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p>{item}</p>
          </li>
        ))}
      </ol>
      <p className="rs-note">끌리는 것 하나만 골라도 좋아요.</p>
    </section>
  );
}

const STYLES = `
.rs-eyebrow { color:var(--san-text); font-family:var(--san-font-mono); font-size:10.5px; font-weight:500; letter-spacing:.2em; text-transform:uppercase; line-height:1.8; }
.rs-identity { padding:34px 0 30px; }
.rs-identity h2,.rs-charm h2 { margin-top:12px; color:var(--san-text); font-size:24px; font-weight:300; line-height:1.45; letter-spacing:0; }
.rs-large-copy { margin-top:17px !important; color:var(--san-text); font-size:20px; line-height:1.9; letter-spacing:0; word-break:keep-all; overflow-wrap:anywhere; }
.rs-panel { margin-top:14px; padding:27px 23px; border-radius:22px; }
.rs-peers { background:var(--san-surface); }
.rs-trend { background:var(--san-surface); }
.rs-panel h2 { margin-top:9px; color:var(--san-text); font-size:clamp(30px,8vw,42px); font-weight:300; line-height:1.25; letter-spacing:0; word-break:keep-all; }
.rs-trend h2 { color:var(--san-text); }
.rs-copy { margin-top:18px !important; color:var(--san-text); font-size:13px; line-height:1.95; word-break:keep-all; overflow-wrap:anywhere; }
.rs-trend .rs-copy { color:var(--san-text); }
.rs-peer-rows { display:grid; gap:21px; margin-top:25px; }
.rs-row-head { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:6px 12px; margin-bottom:11px; }
.rs-row-head h3 { margin:0; font-size:13px; font-weight:400; color:var(--san-text); }
.rs-row-head > span { color:var(--san-text); font-size:11px; }
.rs-bar-line { display:grid; grid-template-columns:34px minmax(0,1fr) 46px; gap:9px; align-items:center; margin-top:7px; }
.rs-bar-line > span { color:var(--san-text); font-family:var(--san-font-mono); font-size:11px; font-variant-numeric:tabular-nums; }
.rs-bar-line > span:last-child { text-align:right; }
.rs-track { height:2px; overflow:hidden; border-radius:99px; background:var(--san-surface-strong); }
.rs-track > i { display:block; height:100%; border-radius:inherit; background:var(--san-text); }
.rs-track-peer > i { background:var(--san-text-faint); }
.rs-note { margin-top:15px !important; color:var(--san-text); font-size:11px; line-height:1.85; word-break:keep-all; }
.rs-peer-rows > .rs-note { margin-top:0 !important; }
.rs-trend-signal { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:23px; padding-top:18px; border-top:1px solid transparent; }
.rs-trend-signal > div > span { color:var(--san-text); font-size:11px; }
.rs-trend-signal h3 { margin:7px 0 0; color:var(--san-text); font-size:22px; font-weight:300; letter-spacing:0; }
.rs-change { color:var(--san-text); font-family:var(--san-font-mono); font-size:22px; font-weight:300; font-variant-numeric:tabular-nums; }
.rs-trend-signal > .rs-note { flex-basis:100%; margin-top:0 !important; }
.rs-charm { padding:31px 0; border-bottom:1px solid transparent; }
.rs-charm h2 { font-size:19px; }
.rs-charm .rs-large-copy { font-size:18px; }
.rs-region { padding:31px 0; border-bottom:1px solid transparent; }
.rs-region h2 { margin-top:15px; color:var(--san-text); font-size:clamp(33px,9vw,55px); font-weight:300; line-height:1.2; letter-spacing:0; overflow-wrap:anywhere; }
.rs-regions { display:grid; gap:18px; margin-top:23px !important; padding:0; list-style:none; }
.rs-region-label { display:flex; align-items:baseline; gap:10px; color:var(--san-text); font-size:12px; }
.rs-region-label > span:nth-child(2) { flex:1; overflow-wrap:anywhere; }
.rs-index { color:var(--san-text); font-family:var(--san-font-mono); font-size:11px; font-variant-numeric:tabular-nums; }
.rs-region-label small { color:var(--san-text); font-family:var(--san-font-mono); font-size:11px; font-variant-numeric:tabular-nums; }
.rs-track-region { margin-top:9px; }
.rs-track-region > i { background:var(--san-text); }
.rs-next { padding:32px 0 15px; }
.rs-next h2 { margin-top:12px; color:var(--san-text); font-size:31px; font-weight:300; line-height:1.3; letter-spacing:0; }
.rs-next ol { margin-top:23px !important; padding:0; list-style:none; }
.rs-next li { display:flex; align-items:baseline; gap:17px; padding:13px 0; }
.rs-next li p { color:var(--san-text); font-size:15px; line-height:1.9; word-break:keep-all; overflow-wrap:anywhere; }
@media(min-width:640px) { .rs-panel{padding:31px 32px;} .rs-large-copy{font-size:24px;} .rs-charm .rs-large-copy{font-size:21px;} .rs-copy{font-size:14px;} }
`;
