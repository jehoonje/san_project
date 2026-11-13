// web/src/lib/signal.ts
// 근처 산책자 신호: 대략적인 위치, 오늘의 신호명, 주고받는 감정 표현
import { haversineMeters, type LngLat } from "@/lib/geo";

/**
 * 이 거리 안에 "가까이 잡힌" 산책자만 지도에 보임.
 * 지도를 아무리 축소해도 이 범위 밖은 나타나지 않고, 범위를 벗어나면 사라집니다.
 */
export const SIGNAL_RADIUS_M = 400;

/** 감정 표현 5가지 (아바타가 상대를 향해 돌아선 뒤 재생) */
export const EMOTES = [
  { id: "wave", label: "손 흔들기", done: "손을 흔들었어요", got: "손을 흔들어요" },
  { id: "talk", label: "말 건네기", done: "말을 건넸어요", got: "말을 건네요" },
  { id: "bow", label: "꾸벅 인사", done: "꾸벅 인사했어요", got: "꾸벅 인사해요" },
  { id: "clap", label: "박수", done: "박수를 보냈어요", got: "박수를 보내요" },
  { id: "cheer", label: "환호", done: "환호했어요", got: "환호해요" },
] as const;

export type EmoteId = (typeof EMOTES)[number]["id"];

const EMOTE_IDS = new Set<string>(EMOTES.map((e) => e.id));

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && EMOTE_IDS.has(value);
}

export function emoteInfo(id: EmoteId) {
  return EMOTES.find((e) => e.id === id) ?? EMOTES[0];
}

/*
 * 채널 격자: 약 670m x 660m (서울 위도 기준).
 * 내 칸과 주변 8칸(3x3)을 구독하면 반경 600m 안의 신호를 모두 받을 수 있음.
 */
const CELL_LAT = 0.006;
const CELL_LNG = 0.0076;

/** 공유 위치는 약 100m 격자로 뭉갬 */
const SNAP_DEG = 0.001;
/** 격자 중심에 모두 겹쳐 보이지 않도록 세션마다 고정된 작은 흔들림 (±약 30m) */
const OFFSET_DEG = 0.00028;

export type SignalPresence = {
  v: 2;
  /** 세션마다 새로 만드는 임시 식별자 (계정과 연결되지 않음) */
  sid: string;
  /** 오늘의 신호명 */
  cs: string;
  /** 뭉갠 위치 [lng, lat] */
  p: LngLat;
  /** 이 신호가 속한 채널 칸 */
  ch: string;
  at: number;
};

export type EmoteMessage = { from: string; to: string; cs: string; e: EmoteId };

/**
 * 재식별 토큰 교환.
 * 양쪽이 인사를 주고받아 교차가 이뤄진 뒤에만 보냅니다.
 * 한쪽만 인사한 상대에게는 가지 않습니다.
 */
export type KeyMessage = { from: string; to: string; k: string };

export function cellOf([lng, lat]: LngLat) {
  return `${Math.floor(lat / CELL_LAT)}:${Math.floor(lng / CELL_LNG)}`;
}

export function neighborCells(cell: string) {
  const [i, j] = cell.split(":").map(Number);
  const out: string[] = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) out.push(`${i + di}:${j + dj}`);
  }
  return out;
}

export function channelName(cell: string) {
  return `san-signal-v3:${cell}`;
}

export function makeSessionOffset(): LngLat {
  const r = () => (Math.random() * 2 - 1) * OFFSET_DEG;
  return [r(), r()];
}

export function coarsen([lng, lat]: LngLat, offset: LngLat): LngLat {
  const snap = (v: number) => Math.round(v / SNAP_DEG) * SNAP_DEG;
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  return [round(snap(lng) + offset[0]), round(snap(lat) + offset[1])];
}

/** 숫자 대신 거리 감각을 한 줄로 */
export function distanceLabel(meters: number) {
  if (meters < 80) return "아주 가까이 있어요";
  if (meters < 200) return "가까이 있어요";
  return "조금 떨어져 있어요";
}

export function signalDistance(a: LngLat, b: LngLat) {
  return haversineMeters(a, b);
}

// FNV-1a 32bit
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const WORDS = [
  "LYRA", "VELA", "NOVA", "ECHO", "DRIFT", "HALO", "LUMEN", "ATLAS",
  "ORBIT", "PULSE", "IRIS", "AURA", "REED", "MIRA", "RHEA", "ZENITH",
  "KITE", "OPAL", "ONYX", "SOL", "TIDE", "ARC", "FERN", "MOTH",
];

function localDate(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** 하루마다 바뀌는 신호명: 같은 날에는 같은 이름, 다음 날에는 다른 이름 */
export function callSignFor(userId: string, date = new Date()) {
  const h = hash(`${userId}:${localDate(date)}`);
  const word = WORDS[h % WORDS.length];
  const tail = ((h >>> 8) & 0xff).toString(16).toUpperCase().padStart(2, "0");
  return `${word}-${tail}`;
}

export function makeSessionId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SID_RE = /^[0-9a-f]{16}$|^ghost-[a-z0-9-]{1,24}$/;
const CS_RE = /^[A-Z]{2,8}-[0-9A-F]{2}$/;

function validCoord(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

export function sanitizePresence(raw: unknown): SignalPresence | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (v.v !== 2) return null;
  if (typeof v.sid !== "string" || !SID_RE.test(v.sid)) return null;
  if (typeof v.cs !== "string" || !CS_RE.test(v.cs)) return null;
  if (!validCoord(v.p)) return null;
  if (typeof v.ch !== "string" || !/^-?\d+:-?\d+$/.test(v.ch)) return null;
  const at = typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0;
  return { v: 2, sid: v.sid, cs: v.cs, p: v.p, ch: v.ch, at };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeKey(raw: unknown): KeyMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.from !== "string" || !SID_RE.test(v.from)) return null;
  if (typeof v.to !== "string" || !SID_RE.test(v.to)) return null;
  if (typeof v.k !== "string" || !UUID_RE.test(v.k)) return null;
  return { from: v.from, to: v.to, k: v.k };
}

export function sanitizeEmote(raw: unknown): EmoteMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.from !== "string" || !SID_RE.test(v.from)) return null;
  if (typeof v.to !== "string" || !SID_RE.test(v.to)) return null;
  if (typeof v.cs !== "string" || !CS_RE.test(v.cs)) return null;
  if (!isEmoteId(v.e)) return null;
  return { from: v.from, to: v.to, cs: v.cs, e: v.e };
}
