"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComparisonReportResponse } from "@/types/comparison";
import { buildPlaceTraitPatterns } from "@/lib/placeTraits";
import { PlaceTraitSection } from "@/components/PlaceTraitSection";
import { MenuInsightSection } from "@/components/MenuInsightSection";
import {
  StorySectionStyles,
  IdentitySection,
  PeerSection,
  TrendSection,
  CharmSection,
  RegionSection,
  NextStepsSection,
} from "@/components/ReportStorySections";
import { readToken } from "@/lib/themeTokens";
import s from "./AnalysisReport.module.css";

type Props = { accessToken: string };
type Loading = {
  status: "loading";
  message: string;
  current: number;
  total: number;
};
type State =
  | Loading
  | { status: "ready"; data: ComparisonReportResponse; warning: string | null }
  | { status: "error"; message: string };
type HttpError = Error & { status?: number };
const INITIAL: Loading = {
  status: "loading",
  message: "기록을 살펴보고 있어요",
  current: 0,
  total: 0,
};
const ERRORS: Record<string, string> = {
  unauthorized: "로그인이 만료됐어요. 다시 로그인해주세요.",
  report_timeout:
    "기록을 살펴보는 데 시간이 오래 걸렸어요. 잠시 뒤 다시 시도해주세요.",
  report_invalid: "기록을 정리하지 못했어요. 다시 불러와주세요.",
  report_rate_limited: "지금은 분석 요청이 많아요. 잠시 뒤 다시 시도해주세요.",
  report_provider_failed:
    "분석 서비스에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.",
  report_configuration_missing:
    "분석 서비스를 준비하는 중이에요. 잠시 뒤 다시 시도해주세요.",
};
const aborted = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

async function parse<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      value &&
      typeof value === "object" &&
      "error" in value &&
      typeof value.error === "string"
        ? value.error
        : "request_failed";
    const error = new Error(code) as HttpError;
    error.status = response.status;
    throw error;
  }
  if (value === null || value === undefined) throw new Error("empty_response");
  return value as T;
}

async function load(
  token: string,
  force: boolean,
  signal: AbortSignal,
  progress: (value: Loading) => void,
) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const requestReport = async (allowPartial = false) =>
    parse<ComparisonReportResponse>(await fetchReport(allowPartial));
  async function fetchReport(allowPartial: boolean): Promise<Response> {
    return fetch("/api/analysis-report", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({ force, allowPartial }),
    });
  }
  const first = await requestReport();
  if (first.status === "ready")
    return {
      data: first,
      warning: first.missingPlaces.length
        ? "일부 장소 정보는 아직 확인되지 않았어요."
        : null,
    };
  const places = first.missingPlaces;
  let next = 0,
    completed = 0,
    failed = 0,
    stopped = false;
  progress({
    status: "loading",
    message: "장소의 이야기도 함께 읽고 있어요",
    current: 0,
    total: places.length,
  });
  const worker = async () => {
    while (!signal.aborted && !stopped && next < places.length) {
      const place = places[next++];
      try {
        await parse<unknown>(
          await fetch("/api/place-insight", {
            method: "POST",
            headers,
            signal,
            body: JSON.stringify(place),
          }),
        );
      } catch (error) {
        if (signal.aborted || aborted(error)) throw error;
        const status = (error as HttpError).status;
        if (status === 401 || status === 403) {
          stopped = true;
          throw error;
        }
        if (status === 429) {
          stopped = true;
          return;
        }
        failed += 1;
        console.error("장소 정보 보강 실패:", place.name, error);
      }
      completed += 1;
      progress({
        status: "loading",
        message: "장소의 이야기도 함께 읽고 있어요",
        current: completed,
        total: places.length,
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, places.length) }, () => worker()),
  );
  if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
  progress({
    status: "loading",
    message: "기록을 정리하고 있어요",
    current: completed,
    total: places.length,
  });
  const data = await requestReport(true);
  if (data.status !== "ready") throw new Error("report_not_ready");
  const warning = stopped
    ? "조회 한도에 도달했어요. 지금 확인된 정보로 먼저 읽어봤어요."
    : failed || data.missingPlaces.length
      ? "일부 장소 정보는 확인하지 못했어요. 확인된 정보를 기준으로 읽어봤어요."
      : null;
  return { data, warning };
}

function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = [];
  let line = "";
  for (const char of text) {
    if (char === "\n") {
      result.push(line);
      line = "";
      continue;
    }
    if (line && ctx.measureText(line + char).width > width) {
      result.push(line.trimEnd());
      line = char.trimStart();
    } else line += char;
  }
  if (line) result.push(line);
  return result;
}
function draw(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  height: number,
  max: number,
) {
  const all = lines(ctx, text, 900);
  const shown = all.slice(0, max);
  if (all.length > max) {
    let last = shown[shown.length - 1] ?? "";
    while (last && ctx.measureText(last + "…").width > 900)
      last = Array.from(last).slice(0, -1).join("");
    shown[shown.length - 1] = last + "…";
  }
  shown.forEach((line, index) => ctx.fillText(line, 90, y + index * height));
  return y + shown.length * height;
}
async function makeCard(title: string, summary: string, tags: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  // 공유 카드도 지금 테마의 종이/먹 색 그대로: 면 + 큰 블러 원 + 얇은 글자
  const paper = readToken("--san-background", "#f2f2ef");
  const ink = readToken("--san-text", "#2e3440");
  const warm = readToken("--san-orb-warm", "#ecd2c2");
  const cool = readToken("--san-orb-cool", "#bccadb");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.save();
  ctx.filter = "blur(90px)";
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = warm;
  ctx.beginPath();
  ctx.arc(820, 420, 360, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cool;
  ctx.beginPath();
  ctx.arc(980, 700, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(840, 520, 620, 300, -0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const sans = '"Pretendard Variable", Pretendard, sans-serif';
  ctx.fillStyle = ink;
  ctx.font = `500 30px ui-monospace, Menlo, monospace`;
  ctx.fillText("S A N  ·  M Y  T A S T E", 90, 220);
  ctx.font = `300 96px ${sans}`;
  const bottom = draw(ctx, title, 520, 138, 4);
  ctx.font = `400 42px ${sans}`;
  draw(ctx, summary, bottom + 70, 74, 6);
  ctx.font = `400 34px ${sans}`;
  draw(ctx, tags.join("   ·   "), 1660, 58, 3);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("image_generation_failed")),
      "image/png",
    ),
  );
  const file = new File([blob], "my-taste.png", { type: "image/png" });
  if (
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title });
      return "카드를 공유했어요.";
    } catch (error) {
      if (aborted(error)) throw error;
    }
  }
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = "my-taste.png";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return "이미지 저장을 요청했어요.";
}
function ShareButton({
  title,
  summary,
  tags,
}: {
  title: string;
  summary: string;
  tags: string[];
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const locked = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const share = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await makeCard(title, summary, tags);
      if (mounted.current) setMessage(result);
    } catch (error) {
      if (mounted.current && !aborted(error)) {
        console.error("공유 실패:", error);
        setMessage("카드를 만들지 못했어요. 다시 시도해주세요.");
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="ar-share">
      <button
        className={s.share}
        type="button"
        disabled={busy}
        onClick={() => void share()}
      >
        {busy ? "카드를 만들고 있어요" : "카드로 남기기"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

function Report({
  data,
  accessToken,
}: {
  data: ComparisonReportResponse;
  accessToken: string;
}) {
  const { analysis: stats, report, comparison } = data;
  if (!stats.totalVisits)
    return (
      <div className={s.empty}>
        <h2>아직 남긴 장소가 없어요</h2>
        <p>장소를 남기면 기록 사이의 공통점을 보여드려요.</p>
      </div>
    );
  if (!report)
    return (
      <div className={s.empty}>
        <h2>기록이 쌓이고 있어요</h2>
        <p>새로 읽기를 누르면 지금까지의 기록을 다시 살펴봐요.</p>
      </div>
    );
  const category = [...stats.categories]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const region = [...stats.regions]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const trait = buildPlaceTraitPatterns(stats.placeEvidence).patterns.find(
    (r) => r.group !== "menu" && r.group !== "atmosphere",
  );
  const tags = [
    ...new Set(
      [category?.label, trait?.label, region?.label].filter((v): v is string =>
        Boolean(v),
      ),
    ),
  ].slice(0, 3);
  return (
    <main className={s.content}>
      <header className={s.persona}>
        <span className={s.orb} aria-hidden="true" />
        <span className={s.orbit} aria-hidden="true" />
        <div className={s.personaType}>
          <h1>{report.title}</h1>
        </div>
        <p className={s.tagline}>{report.summary}</p>
        {/* 감성은 흐리게, 데이터는 또렷하게 */}
        <dl className={s.figures}>
          <div>
            <dd>{stats.totalVisits}</dd>
            <dt>Visits</dt>
          </div>
          <div>
            <dd>{stats.uniquePlaces}</dd>
            <dt>Places</dt>
          </div>
          <div>
            <dd>{stats.regions.filter((r) => r.count > 0).length}</dd>
            <dt>Areas</dt>
          </div>
        </dl>
        {tags.length > 0 && (
          <ul className={s.tags} aria-label="기록에서 눈에 띄는 장소와 특징">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        <ShareButton
          title={report.title}
          summary={report.summary}
          tags={tags}
        />
      </header>
      <IdentitySection report={report} />
      <PlaceTraitSection
        summary={stats.placeEvidence}
        accessToken={accessToken}
        reportKey={data.generatedAt ?? "no-report"}
      />
      <PeerSection copy={report.categoryPreference} comparison={comparison} />
      <TrendSection copy={report.timePattern} comparison={comparison} />
      <CharmSection copy={report.moodAndSpending} />
      <MenuInsightSection summary={stats.placeEvidence} />
      <RegionSection stats={stats} copy={report.areaPreference} />
      <NextStepsSection items={report.recommendations} />
    </main>
  );
}

export function AnalysisReport({ accessToken }: Props) {
  const [state, setState] = useState<State>(INITIAL);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0);
  const run = useCallback(
    async (force: boolean) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      const id = ++generation.current;
      const current = () => !next.signal.aborted && id === generation.current;
      setState(INITIAL);
      try {
        const result = await load(accessToken, force, next.signal, (value) => {
          if (current()) setState(value);
        });
        if (current())
          setState({
            status: "ready",
            data: result.data,
            warning: result.warning,
          });
      } catch (error) {
        if (!current() || aborted(error)) return;
        next.abort();
        console.error("리포트 요청 실패:", error);
        setState({
          status: "error",
          message:
            ERRORS[error instanceof Error ? error.message : ""] ??
            "지금은 불러오지 못했어요. 잠시 뒤 다시 시도해주세요.",
        });
      }
    },
    [accessToken],
  );
  useEffect(() => {
    void run(false);
    return () => {
      generation.current += 1;
      controller.current?.abort();
    };
  }, [run]);
  const progress =
    state.status === "loading" && state.total > 0
      ? Math.min(100, Math.max(0, (state.current / state.total) * 100))
      : 0;
  return (
    <div className={s.root}>
      <StorySectionStyles />
      <style>{STYLES}</style>
      {state.status === "loading" && (
        <div className={s.loading} role="status" aria-live="polite">
          <span className={`san-ripples ${s.ripples}`} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p>기록을 살펴보고 있어요</p>
          {state.total > 0 && (
            <div className="ar-progress">
              <div
                role="progressbar"
                aria-label="장소 정보 처리"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <i style={{ width: `${progress}%` }} />
              </div>
              <span>
                {state.current}/{state.total}
              </span>
            </div>
          )}
        </div>
      )}
      {state.status === "error" && (
        <div className={s.empty}>
          <h2>불러오지 못했어요</h2>
          <p role="alert">{state.message}</p>
          <button type="button" onClick={() => void run(false)}>
            다시 불러오기
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className={s.toolbar}>
            <button type="button" onClick={() => void run(true)}>
              새로 읽기
            </button>
          </div>
          {state.warning && (
            <p className="ar-warning" role="status">
              {state.warning}
            </p>
          )}
          <Report data={state.data} accessToken={accessToken} />
        </>
      )}
    </div>
  );
}
const STYLES = `
.ar-share p{margin-top:10px!important;color:var(--san-text);font-size:12px;line-height:1.7;}
.ar-share p:empty{display:none;}
.ar-progress{width:min(240px,100%);margin-top:28px;}
.ar-progress>div{height:2px;overflow:hidden;border-radius:99px;background:var(--san-surface-strong);}
.ar-progress i{display:block;height:100%;border-radius:inherit;background:var(--san-text);transition:width .4s cubic-bezier(0.22,1,0.36,1);}
.ar-progress>span{display:block;margin-top:12px;color:var(--san-text);font-family:var(--san-font-mono);font-size:10.5px;letter-spacing:.14em;font-variant-numeric:tabular-nums;}
.ar-warning{width:calc(100% - 48px);max-width:720px;margin:14px auto 0!important;padding:12px 18px;border:0;border-radius:22px;background:var(--san-surface);color:var(--san-text);font-size:12px;line-height:1.8;}
@media(prefers-reduced-motion:reduce){.ar-progress i{transition:none;}}
`;
export default AnalysisReport;
