// web/src/lib/handovers.ts
// 장소 건네기: 내가 남긴 장소를 같은 서클의 상대에게 보냅니다.
// 받은 장소는 상대 지도에 점 하나로 놓이고, 열어 보면 그 시각이 남습니다.
import { supabase } from "@/lib/supabaseClient";
import { isMissingTable } from "@/lib/circles";
import type { PlaceCategory } from "@/types/place";

export type Handover = {
  id: string;
  fromUser: string;
  toUser: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  regionDong: string | null;
  note: string | null;
  sentAt: string;
  openedAt: string | null;
  /** 보낸 사람 이름 (받은 목록에서만 채워짐) */
  fromName: string | null;
};

export type HandoverDraft = {
  toUser: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  regionDong?: string | null;
  note?: string | null;
};

const EVENT = "san-handovers-change";

export function onHandoversChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

type Row = {
  id: string;
  from_user: string;
  to_user: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  region_dong: string | null;
  note: string | null;
  sent_at: string;
  opened_at: string | null;
  profiles?: { display_name: string | null } | null;
};

const CATEGORIES = new Set([
  "cafe",
  "restaurant",
  "bar",
  "park",
  "shop",
  "culture",
  "etc",
]);

function fromRow(row: Row): Handover {
  return {
    id: row.id,
    fromUser: row.from_user,
    toUser: row.to_user,
    name: row.name,
    category: (CATEGORIES.has(row.category) ? row.category : "etc") as PlaceCategory,
    lat: Number(row.lat),
    lng: Number(row.lng),
    regionDong: row.region_dong,
    note: row.note,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    fromName: row.profiles?.display_name?.trim() || null,
  };
}

/** 나에게 건네진 장소 (최근 것부터) */
export async function listReceived(): Promise<Handover[]> {
  const { data, error } = await supabase
    .from("place_handovers")
    .select(
      `id, from_user, to_user, name, category, lat, lng, region_dong, note,
       sent_at, opened_at, profiles!place_handovers_from_user_fkey ( display_name )`,
    )
    .order("sent_at", { ascending: false })
    .limit(60);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  // 받은 것만 (RLS가 보낸 것도 같이 내려 주므로 여기서 거릅니다)
  const me = (await supabase.auth.getUser()).data.user?.id;
  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.to_user === me)
    .map(fromRow);
}

export async function sendHandover(draft: HandoverDraft) {
  const { error } = await supabase.from("place_handovers").insert({
    to_user: draft.toUser,
    name: draft.name.trim().slice(0, 60),
    category: draft.category,
    lat: draft.lat,
    lng: draft.lng,
    region_dong: draft.regionDong ?? null,
    note: draft.note?.trim().slice(0, 80) || null,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 받은 장소를 열어 봄 */
export async function markOpened(id: string) {
  const { error } = await supabase
    .from("place_handovers")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", id)
    .is("opened_at", null);
  if (error && !isMissingTable(error)) throw error;
  window.dispatchEvent(new CustomEvent(EVENT));
}
