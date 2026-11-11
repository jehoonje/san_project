// web/src/lib/signal.ts
// 근처 산책자 신호: 대략적인 위치, 오늘의 신호명, 주고받는 메시지 형식
import { haversineMeters, type LngLat } from "@/lib/geo";
import { sanitizeCard, type TasteCard } from "@/lib/tasteCollection";

/** 이 거리 안의 신호만 지도에 보임 */
export const SIGNAL_RADIUS_M = 600;

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
  v: 1;
  /** 세션마다 새로 만드는 임시 식별자 (계정과 연결되지 않음) */
  sid: string;
  /** 오늘의 신호명 */
  cs: string;
  /** 뭉갠 위치 [lng, lat] */
  p: LngLat;
  /** 이 신호가 속한 채널 칸 */
  ch: string;
  c: TasteCard;
  at: number;
};

export type GiftPlace = {
  name: string;
  category: string;
  region: string | null;
};

export type WaveMessage = { from: string; to: string; cs: string; c: TasteCard };
export type GiftMessage = { from: string; to: string; cs: string; place: GiftPlace };

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
  return `san-signal-v1:${cell}`;
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

export function distanceLabel(meters: number) {
  if (meters < 100) return "100m 안";
  if (meters < 300) return "300m 안";
  return "600m 안";
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
  "ORBIT", "PULSE", "IRIS", "AURA", "CYAN", "MIRA", "RHEA", "ZENITH",
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
  if (v.v !== 1) return null;
  if (typeof v.sid !== "string" || !SID_RE.test(v.sid)) return null;
  if (typeof v.cs !== "string" || !CS_RE.test(v.cs)) return null;
  if (!validCoord(v.p)) return null;
  if (typeof v.ch !== "string" || !/^-?\d+:-?\d+$/.test(v.ch)) return null;
  const card = sanitizeCard(v.c);
  if (!card) return null;
  const at = typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0;
  return { v: 1, sid: v.sid, cs: v.cs, p: v.p, ch: v.ch, c: card, at };
}

export function sanitizeWave(raw: unknown): WaveMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.from !== "string" || !SID_RE.test(v.from)) return null;
  if (typeof v.to !== "string" || !SID_RE.test(v.to)) return null;
  if (typeof v.cs !== "string" || !CS_RE.test(v.cs)) return null;
  const card = sanitizeCard(v.c);
  if (!card) return null;
  return { from: v.from, to: v.to, cs: v.cs, c: card };
}

export function sanitizeGiftPlace(raw: unknown): GiftPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim().slice(0, 60) : "";
  const category =
    typeof v.category === "string" ? v.category.trim().slice(0, 20) : "etc";
  const region =
    typeof v.region === "string" && v.region.trim()
      ? v.region.trim().slice(0, 30)
      : null;
  if (!name) return null;
  return { name, category, region };
}

export function sanitizeGift(raw: unknown): GiftMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.from !== "string" || !SID_RE.test(v.from)) return null;
  if (typeof v.to !== "string" || !SID_RE.test(v.to)) return null;
  if (typeof v.cs !== "string" || !CS_RE.test(v.cs)) return null;
  const place = sanitizeGiftPlace(v.place);
  if (!place) return null;
  return { from: v.from, to: v.to, cs: v.cs, place };
}
