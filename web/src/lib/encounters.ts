// web/src/lib/encounters.ts
// 교차 로그: 근처 산책자와 서로 인사를 주고받은(교차한) 기록.
// Supabase encounters 테이블에 저장하고, 테이블이 아직 없거나 게스트면 이 기기에만 보관합니다.
// 상대는 그날의 신호명으로만 남고, 계정 정보는 저장하지 않습니다.
import { supabase } from "@/lib/supabaseClient";
import { isEmoteId, type EmoteId } from "@/lib/signal";

export type Encounter = {
  id: string;
  peerCallSign: string;
  myEmote: EmoteId;
  peerEmote: EmoteId;
  region: string | null;
  metAt: string;
};

const LOCAL_PREFIX = "san-encounters-v2:";
const MAX_LOCAL = 60;
const EVENT = "san-encounters-change";

// null: 아직 모름, false: 테이블 없음(로컬만 사용)
let remoteAvailable: boolean | null = null;

type Row = {
  id: string;
  peer_call_sign: string;
  my_emote: string | null;
  peer_emote: string | null;
  region: string | null;
  met_at: string;
};

function fromRow(row: Row): Encounter {
  return {
    id: row.id,
    peerCallSign: row.peer_call_sign,
    myEmote: isEmoteId(row.my_emote) ? row.my_emote : "wave",
    peerEmote: isEmoteId(row.peer_emote) ? row.peer_emote : "wave",
    region: row.region,
    metAt: row.met_at,
  };
}

function toRow(e: Encounter) {
  return {
    id: e.id,
    peer_call_sign: e.peerCallSign,
    my_emote: e.myEmote,
    peer_emote: e.peerEmote,
    region: e.region,
    met_at: e.metAt,
  };
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    (/encounters|column/.test(error.message ?? "") &&
      /does not exist|not find/i.test(error.message ?? ""))
  );
}

function readLocal(ownerId: string): Encounter[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + ownerId);
    const list = raw ? (JSON.parse(raw) as Encounter[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(ownerId: string, list: Encounter[]) {
  try {
    window.localStorage.setItem(
      LOCAL_PREFIX + ownerId,
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

/** remote=false 이면(게스트) 이 기기 기록만 읽습니다. */
export async function loadEncounters(
  ownerId: string,
  remote: boolean,
): Promise<Encounter[]> {
  const local = readLocal(ownerId);
  if (!remote || remoteAvailable === false) return sortDesc(local);

  const { data, error } = await supabase
    .from("encounters")
    .select("id, peer_call_sign, my_emote, peer_emote, region, met_at")
    .order("met_at", { ascending: false })
    .limit(MAX_LOCAL);

  if (error) {
    if (isMissingTable(error)) remoteAvailable = false;
    return sortDesc(local);
  }

  remoteAvailable = true;
  const merged = new Map<string, Encounter>();
  for (const e of local) merged.set(e.id, e);
  for (const row of (data ?? []) as Row[]) merged.set(row.id, fromRow(row));
  return sortDesc([...merged.values()]);
}

export async function saveEncounter(
  ownerId: string,
  remote: boolean,
  encounter: Encounter,
) {
  const local = readLocal(ownerId).filter((e) => e.id !== encounter.id);
  writeLocal(ownerId, sortDesc([encounter, ...local]));
  window.dispatchEvent(new CustomEvent(EVENT));

  if (!remote || remoteAvailable === false) return;
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

export function onEncountersChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
