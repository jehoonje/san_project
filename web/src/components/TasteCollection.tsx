"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { buildPlaceTraitPatterns } from "@/lib/placeTraits";
import {
  buildCollection,
  fallbackTitle,
  groupMeta,
  type Collection,
  type DexEntry,
} from "@/lib/tasteCollection";
import { orbitLayout, type OrbitNode } from "@/lib/orbitLayout";
import {
  enrichPlaces,
  fetchReading,
  fetchSnapshot,
  isAbort,
  peekSnapshot,
  rememberSnapshot,
  type TasteSnapshot,
} from "@/lib/tasteProfile";
import { shareSignatureCard } from "@/lib/signatureCard";
import { useTraitFeedback } from "@/hooks/useTraitFeedback";
import { EASE_AMBIENT } from "@/lib/motion";
import styles from "./TasteCollection.module.css";

type Props = {
  accessToken: string;
  /** 컬렉션 아래에 이어지는 영역 (스친 신호 기록 등) */
  footer?: ReactNode;
};

type Sync =
  | { kind: "enrich"; done: number; total: number }
  | { kind: "reading" }
  | null;

const SEEN_KEY = "san-collection-seen-v1";

function readSeen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(keys: Iterable<string>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    // 저장 불가 환경은 무시
  }
}

function formatUpdated(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function countLine(entry: DexEntry) {
  if (!entry.unlocked) return groupMeta(entry.group).hint;
  return entry.group === "category"
    ? `${entry.count}번 남긴 장소`
    : `${entry.count}곳에서 발견`;
}

/* ── 궤도 ─────────────────────────────────── */

function OrbitNodeMark({
  node,
  index,
  selected,
  fresh,
  onSelect,
}: {
  node: OrbitNode;
  index: number;
  selected: boolean;
  fresh: boolean;
  onSelect: (key: string) => void;
}) {
  const { entry } = node;
  const label = entry.unlocked ? entry.label : "아직 발견하지 못한 취향";
  return (
    <g
      className={styles.node}
      data-unlocked={entry.unlocked || undefined}
      data-selected={selected || undefined}
      data-fresh={fresh || undefined}
      transform={`translate(${node.x.toFixed(2)} ${node.y.toFixed(2)})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(entry.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(entry.key);
        }
      }}
    >
      <circle r={15} className={styles.hit} />
      {entry.unlocked && (
        <circle
          r={node.radius * 3.4}
          className={styles.halo}
          style={{ animationDelay: `${index * 45}ms` }}
        />
      )}
      <circle
        r={node.radius}
        className={styles.dot}
        style={{ animationDelay: `${index * 45}ms` }}
      />
      {selected && <circle r={node.radius + 6} className={styles.select} />}
    </g>
  );
}

function Orbit({
  collection,
  selectedKey,
  fresh,
  onSelect,
}: {
  collection: Collection;
  selectedKey: string | null;
  fresh: Set<string>;
  onSelect: (key: string) => void;
}) {
  const layout = useMemo(() => orbitLayout(collection), [collection]);
  const ring = (r: "inner" | "outer") => ({
    links: layout.links.filter(([a]) => a.ring === r),
    nodes: layout.nodes.filter((n) => n.ring === r),
  });
  const outer = ring("outer");
  const inner = ring("inner");
  const order = new Map(layout.nodes.map((node, i) => [node.entry.key, i]));

  const renderRing = (part: ReturnType<typeof ring>) => (
    <>
      {part.links.map(([a, b]) => (
        <line
          key={`${a.entry.key}-${b.entry.key}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          className={styles.link}
        />
      ))}
      {part.nodes.map((node) => (
        <OrbitNodeMark
          key={node.entry.key}
          node={node}
          index={order.get(node.entry.key) ?? 0}
          selected={selectedKey === node.entry.key}
          fresh={fresh.has(node.entry.key)}
          onSelect={onSelect}
        />
      ))}
    </>
  );

  return (
    <svg
      viewBox="-170 -170 340 340"
      className={styles.orbit}
      role="group"
      aria-label={`취향 궤도, ${collection.total}칸 중 ${collection.unlocked}칸 수집`}
    >
      <circle r={layout.outerRadius + 22} className={styles.ringDotted} />
      <circle r={layout.outerRadius} className={styles.ring} />
      <circle r={layout.innerRadius} className={styles.ring} />
      <circle r={30} className={styles.core} />

      <g className={styles.spinOuter}>{renderRing(outer)}</g>
      <g className={styles.spinInner}>{renderRing(inner)}</g>

      <text y={6} className={styles.coreCount} textAnchor="middle">
        {collection.unlocked}
      </text>
      <text y={22} className={styles.coreTotal} textAnchor="middle">
        / {collection.total}
      </text>
    </svg>
  );
}

/* ── 선택한 칸 ─────────────────────────────── */

function EntryDetail({
  entry,
  feedback,
}: {
  entry: DexEntry;
  feedback: {
    enabled: boolean;
    value: "agree" | "disagree" | null;
    busy: boolean;
    onReact: (reaction: "agree" | "disagree") => void;
  };
}) {
  const meta = groupMeta(entry.group);
  return (
    <div className={styles.detail} data-locked={!entry.unlocked || undefined}>
      <p className={styles.eyebrow}>
        {meta.code} <span className={styles.dim}>· {meta.label}</span>
      </p>
      <h3 className={styles.detailTitle}>
        {entry.unlocked ? entry.label : "· · ·"}
      </h3>
      <p className={styles.detailLine}>{countLine(entry)}</p>

      {entry.unlocked && entry.places.length > 0 && (
        <ul className={styles.placeList}>
          {entry.places.slice(0, 4).map((place) => (
            <li key={place.placeId}>
              <span className={styles.placeName}>{place.name}</span>
              {place.regionDong && (
                <span className={styles.dim}>{place.regionDong}</span>
              )}
            </li>
          ))}
          {entry.places.length > 4 && (
            <li className={styles.dim}>+ {entry.places.length - 4}</li>
          )}
        </ul>
      )}

      {feedback.enabled && (
        <div className={styles.feedback}>
          <span className={styles.dim}>이게 나야?</span>
          {(["agree", "disagree"] as const).map((reaction) => (
            <button
              key={reaction}
              type="button"
              disabled={feedback.busy}
              data-active={feedback.value === reaction || undefined}
              onClick={() => feedback.onReact(reaction)}
            >
              {reaction === "agree" ? "맞아요" : "아니에요"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 화면 ─────────────────────────────────── */

export function TasteCollection({ accessToken, footer }: Props) {
  const reduceMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState<TasteSnapshot | null>(() =>
    peekSnapshot(accessToken),
  );
  const [failed, setFailed] = useState(false);
  const [sync, setSync] = useState<Sync>(null);
  const [readingDone, setReadingDone] = useState(false);
  const [readingNote, setReadingNote] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "busy" | "done">(
    "idle",
  );
  const runRef = useRef<AbortController | null>(null);
  const hasSnapshotRef = useRef(snapshot !== null);
  const detailRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  const run = useCallback(
    async (force: boolean) => {
      runRef.current?.abort();
      const controller = new AbortController();
      runRef.current = controller;
      const { signal } = controller;

      try {
        // 1) 통계 + 직전 이름: 즉시 화면
        let snap = await fetchSnapshot(accessToken, { fresh: true });
        if (signal.aborted) return;
        hasSnapshotRef.current = true;
        setSnapshot(snap);
        setFailed(false);
        setReadingNote(null);

        // 2) 정보가 없는 장소는 뒤에서 보강 후 다시 집계
        if (snap.missing.length > 0) {
          setSync({ kind: "enrich", done: 0, total: snap.missing.length });
          await enrichPlaces(accessToken, snap.missing, signal, (done, total) =>
            setSync({ kind: "enrich", done, total }),
          );
          snap = await fetchSnapshot(accessToken, { fresh: true });
          if (signal.aborted) return;
          setSnapshot(snap);
        }

        if (snap.stats.totalVisits === 0) return;

        // 3) AI 해석: 바뀐 게 없으면 서버 캐시로 바로 돌아옴
        setSync({ kind: "reading" });
        const full = await fetchReading(accessToken, { force, signal });
        if (signal.aborted) return;
        const next: TasteSnapshot = {
          stats: full.analysis,
          report: full.report ?? snap.report,
          generatedAt: full.generatedAt ?? snap.generatedAt,
          missing: full.missingPlaces ?? [],
        };
        rememberSnapshot(accessToken, next);
        setSnapshot(next);
        setReadingDone(true);
      } catch (error) {
        if (signal.aborted || isAbort(error)) return;
        console.error("취향 컬렉션 불러오기 실패:", error);
        if (!hasSnapshotRef.current) setFailed(true);
        else setReadingNote("이름을 새로 읽지 못했어요. 지금 모은 것으로 보여드려요.");
      } finally {
        if (!signal.aborted) setSync(null);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    let cancelled = false;
    // 렌더가 끝난 뒤 불러오기 시작 (상태 갱신은 모두 비동기 응답 이후)
    queueMicrotask(() => {
      if (!cancelled) void run(false);
    });
    return () => {
      cancelled = true;
      runRef.current?.abort();
    };
  }, [run]);

  const collection = useMemo(
    () => buildCollection(snapshot?.stats ?? null),
    [snapshot],
  );

  // 새로 열린 칸: 이 화면을 열 때까지 본 칸과 비교 (처음 보는 화면에서는 표시하지 않음)
  const [seenAtOpen] = useState(() =>
    typeof window === "undefined" ? null : readSeen(),
  );
  const fresh = useMemo(() => {
    if (!seenAtOpen || !snapshot) return new Set<string>();
    return new Set(
      collection.entries
        .filter((e) => e.unlocked && !seenAtOpen.has(e.key))
        .map((e) => e.key),
    );
  }, [collection, seenAtOpen, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const seen = readSeen() ?? new Set<string>();
    for (const e of collection.entries) if (e.unlocked) seen.add(e.key);
    writeSeen(seen);
  }, [collection, snapshot]);

  const selected =
    collection.entries.find((e) => e.key === selectedKey) ??
    collection.strongest ??
    collection.entries[0];

  // "이게 나야?"는 두 곳 이상에서 확인된 특징에만
  const feedback = useTraitFeedback(accessToken, readingDone);
  const feedbackKeys = useMemo(
    () =>
      new Set(
        buildPlaceTraitPatterns(snapshot?.stats.placeEvidence).patterns.map(
          (p) => p.key,
        ),
      ),
    [snapshot],
  );

  const title = snapshot?.report?.title ?? fallbackTitle(collection);
  const summary = snapshot?.report?.summary ?? null;
  const recommendations = snapshot?.report?.recommendations ?? [];
  const stats = snapshot?.stats ?? null;

  function select(key: string) {
    setSelectedKey(key);
  }

  function selectFromList(key: string) {
    setSelectedKey(key);
    detailRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }

  async function handleShare() {
    if (shareState === "busy") return;
    setShareState("busy");
    try {
      await shareSignatureCard(collection, title);
      setShareState("done");
    } catch (error) {
      console.error("시그니처 카드 공유 실패:", error);
      setShareState("idle");
    }
  }

  const enter = (delay = 0) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 10, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.7, delay, ease: EASE_AMBIENT },
        };

  if (failed && !snapshot) {
    return (
      <div className={styles.center}>
        <p className={styles.eyebrow}>NO SIGNAL</p>
        <p className={styles.centerText}>지금은 컬렉션을 불러오지 못했어요.</p>
        <button type="button" className={styles.textButton} onClick={() => void run(false)}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className={styles.center} role="status" aria-label="컬렉션 불러오는 중">
        <svg viewBox="-170 -170 340 340" className={styles.orbitLoading} aria-hidden="true">
          <circle r={150} className={styles.ringDotted} />
          <circle r={128} className={styles.ring} />
          <circle r={64} className={styles.ring} />
          <circle r={4} className={styles.loadingCore} />
        </svg>
        <p className={styles.eyebrow}>TUNING IN</p>
      </div>
    );
  }

  const updated = formatUpdated(snapshot.generatedAt);

  return (
    <div className={styles.scroller}>
      <article className={styles.page} aria-labelledby={headingId}>
        {/* 이름 */}
        <motion.header className={styles.header} {...enter(0)}>
          <div className={styles.headerRow}>
            <p className={styles.eyebrow}>TASTE SIGNATURE</p>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => void run(true)}
              disabled={sync !== null}
            >
              {sync ? "읽는 중" : "↻ 새로 읽기"}
            </button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={title}
              id={headingId}
              className={styles.title}
              initial={reduceMotion ? false : { opacity: 0, filter: "blur(10px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={reduceMotion ? undefined : { opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.6, ease: EASE_AMBIENT }}
            >
              {title}
            </motion.h2>
          </AnimatePresence>
          {summary && <p className={styles.summary}>{summary}</p>}
          <p className={styles.status} role="status" aria-live="polite">
            {sync?.kind === "enrich" ? (
              <>
                <span className={styles.pulse} />
                장소 신호 해석 중 {sync.done}/{sync.total}
              </>
            ) : sync?.kind === "reading" ? (
              <>
                <span className={styles.pulse} />
                취향 이름을 고르는 중
              </>
            ) : readingNote ? (
              readingNote
            ) : updated ? (
              `updated ${updated}`
            ) : null}
          </p>
        </motion.header>

        {/* 궤도 */}
        <motion.section className={styles.orbitWrap} {...enter(0.08)}>
          <Orbit
            collection={collection}
            selectedKey={selected?.key ?? null}
            fresh={fresh}
            onSelect={select}
          />
          <p className={styles.orbitCaption}>
            {stats && stats.totalVisits > 0
              ? `${collection.unlocked} / ${collection.total} COLLECTED`
              : "첫 장소를 남기면 첫 별이 켜져요"}
          </p>
        </motion.section>

        {/* 선택한 칸 */}
        <div ref={detailRef} className={styles.detailWrap}>
          <AnimatePresence mode="wait" initial={false}>
            {selected && (
              <motion.div
                key={selected.key}
                initial={reduceMotion ? false : { opacity: 0, y: 6, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4, filter: "blur(6px)" }}
                transition={{ duration: 0.36, ease: EASE_AMBIENT }}
              >
                <EntryDetail
                  entry={selected}
                  feedback={{
                    enabled:
                      feedback.ready &&
                      selected.unlocked &&
                      feedbackKeys.has(selected.key),
                    value: feedback.values[selected.key] ?? null,
                    busy: feedback.pending !== null,
                    onReact: (reaction) => void feedback.react(selected.key, reaction),
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 도감 */}
        <motion.section className={styles.section} {...enter(0.16)}>
          <p className={styles.sectionLabel}>INDEX</p>
          <ul className={styles.dex}>
            {collection.groups.map((group) => (
              <li key={group.group} className={styles.dexRow}>
                <span className={styles.dexCode}>{group.code}</span>
                <span className={styles.dexItems}>
                  {group.entries.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      className={styles.dexItem}
                      data-unlocked={entry.unlocked || undefined}
                      data-selected={selected?.key === entry.key || undefined}
                      data-fresh={fresh.has(entry.key) || undefined}
                      onClick={() => selectFromList(entry.key)}
                      aria-label={entry.unlocked ? entry.label : `${group.label} 미발견`}
                    >
                      {entry.unlocked ? entry.label : "· · ·"}
                      {entry.unlocked && entry.count > 1 && (
                        <sup>{entry.count}</sup>
                      )}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* 기록 요약: 숫자만 한 줄 */}
        {stats && stats.totalVisits > 0 && (
          <motion.p className={styles.metrics} {...enter(0.2)}>
            <span>
              <b>{stats.uniquePlaces}</b> places
            </span>
            <span>
              <b>{stats.routeCount}</b> routes
            </span>
            <span>
              <b>{stats.regions.length}</b> areas
            </span>
            {stats.averageDwellMinutes !== null && (
              <span>
                <b>{stats.averageDwellMinutes}</b>m stay
              </span>
            )}
          </motion.p>
        )}

        {/* 다음 신호 */}
        {recommendations.length > 0 && (
          <motion.section className={styles.section} {...enter(0.24)}>
            <p className={styles.sectionLabel}>NEXT SIGNALS</p>
            <ul className={styles.nextList}>
              {recommendations.map((item) => (
                <li key={item}>
                  <span className={styles.arrow}>→</span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {footer}

        {stats && stats.totalVisits > 0 && (
          <div className={styles.shareRow}>
            <button
              type="button"
              className={styles.shareButton}
              onClick={() => void handleShare()}
              disabled={shareState === "busy"}
            >
              {shareState === "busy"
                ? "카드를 만드는 중"
                : shareState === "done"
                  ? "시그니처 카드를 만들었어요"
                  : "시그니처 카드 공유"}
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
