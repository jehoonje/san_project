// web/src/lib/encounters.ts
// 스친 신호(교차) 기록: Supabase encounters 테이블에 저장하고,
// 테이블이 아직 없으면 이 기기에만 보관합니다.
import { supabase } from "@/lib/supabaseClient";
import { sanitizeCard, type TasteCard } from "@/lib/tasteCollection";
import { sanitizeGiftPlace, type GiftPlace } from "@/lib/signal";

export type Encounter = {
  id: string;
  peerCallSign: string;
  peerCard: TasteCard;
  match: number;
  common: string[];
  region: string | null;
  metAt: string;
  giftReceived: GiftPlace | null;
  giftSent: GiftPlace | null;
};

const LOCAL_PREFIX = "san-encounters-v1:";
const MAX_LOCAL = 60;
const EVENT = "san-encounters-change";

// null: 아직 모름, false: 테이블 없음(로컬만 사용)
let remoteAvailable: boolean | null = null;

type Row = {
  id: string;
  peer_call_sign: string;
  peer_card: unknown;
  match_percent: number | null;
  common_traits: string[] | null;
  region: string | null;
  met_at: string;
  gift_received: unknown;
  gift_sent: unknown;
};

function fromRow(row: Row): Encounter | null {
  const card = sanitizeCard(row.peer_card);
  if (!card) return null;
  return {
    id: row.id,
    peerCallSign: row.peer_call_sign,
    peerCard: card,
    match: row.match_percent ?? 0,
    common: row.common_traits ?? [],
    region: row.region,
    metAt: row.met_at,
    giftReceived: sanitizeGiftPlace(row.gift_received),
    giftSent: sanitizeGiftPlace(row.gift_sent),
  };
}

function toRow(e: Encounter) {
  return {
    id: e.id,
    peer_call_sign: e.peerCallSign,
    peer_card: e.peerCard,
    match_percent: e.match,
    common_traits: e.common,
    region: e.region,
    met_at: e.metAt,
    gift_received: e.giftReceived,
    gift_sent: e.giftSent,
  };
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/encounters/.test(error.message ?? "") &&
      /does not exist|not find/i.test(error.message ?? ""))
  );
}

function readLocal(userId: string): Encounter[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + userId);
    const list = raw ? (JSON.parse(raw) as Encounter[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, list: Encounter[]) {
  try {
    window.localStorage.setItem(
      LOCAL_PREFIX + userId,
      JSON.stringify(list.slice(0, MAX_LOCAL)),
    );
  } catch {
    // 저장 공간이 없으면 무시
  }
}

function sortDesc(list: Encounter[]) {
  return [...list].sort(
    (a, b) => new Date(b.metAt).getTime() - new Date(a.metAt).getTime(),
  );
}

export async function loadEncounters(userId: string): Promise<Encounter[]> {
  const local = readLocal(userId);
  if (remoteAvailable === false) return sortDesc(local);

  const { data, error } = await supabase
    .from("encounters")
    .select(
      "id, peer_call_sign, peer_card, match_percent, common_traits, region, met_at, gift_received, gift_sent",
    )
    .order("met_at", { ascending: false })
    .limit(MAX_LOCAL);

  if (error) {
    if (isMissingTable(error)) remoteAvailable = false;
    return sortDesc(local);
  }

  remoteAvailable = true;
  const merged = new Map<string, Encounter>();
  for (const e of local) merged.set(e.id, e);
  for (const row of (data ?? []) as Row[]) {
    const e = fromRow(row);
    if (e) merged.set(e.id, { ...merged.get(e.id), ...e });
  }
  return sortDesc([...merged.values()]);
}

export async function saveEncounter(userId: string, encounter: Encounter) {
  const local = readLocal(userId).filter((e) => e.id !== encounter.id);
  writeLocal(userId, sortDesc([encounter, ...local]));
  window.dispatchEvent(new CustomEvent(EVENT));

  if (remoteAvailable === false) return;
  const { error } = await supabase
    .from("encounters")
    .upsert(toRow(encounter), { onConflict: "id" });
  if (error) {
    if (isMissingTable(error)) remoteAvailable = false;
    else console.error("교차 기록 저장 실패:", error);
  } else {
    remoteAvailable = true;
  }
}

export async function patchEncounter(
  userId: string,
  id: string,
  patch: Partial<Pick<Encounter, "giftReceived" | "giftSent">>,
) {
  const local = readLocal(userId);
  const current = local.find((e) => e.id === id);
  if (current) {
    await saveEncounter(userId, { ...current, ...patch });
  }
}

export function onEncountersChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
