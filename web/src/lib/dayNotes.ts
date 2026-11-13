// web/src/lib/dayNotes.ts
// 걷지 않은 날 한 줄: 걸은 기록이 없는 날에도 한 줄은 남길 수 있게.
// 게스트는 이 기기에만, 로그인 사용자는 계정에 남습니다.
import { supabase } from "@/lib/supabaseClient";
import { isMissingTable } from "@/lib/circles";
import type { RouteOwner } from "@/lib/routeStore";

export type DayNote = { day: string; body: string; updatedAt: string };

const LOCAL_PREFIX = "san-day-notes-v1:";
const MAX_LOCAL = 120;
const EVENT = "san-day-notes-change";

export function onDayNotesChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** KST 기준 오늘 (YYYY-MM-DD) */
export function today() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function readLocal(ownerId: string): DayNote[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + ownerId);
    const list = raw ? (JSON.parse(raw) as DayNote[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(ownerId: string, list: DayNote[]) {
  try {
    window.localStorage.setItem(
      LOCAL_PREFIX + ownerId,
      JSON.stringify(list.slice(0, MAX_LOCAL)),
    );
  } catch {
    // 저장 공간이 없으면 무시
  }
}

function sortDesc(list: DayNote[]) {
  return [...list].sort((a, b) => b.day.localeCompare(a.day));
}

export async function listDayNotes(owner: RouteOwner): Promise<DayNote[]> {
  if (owner.kind === "guest") return sortDesc(readLocal("guest"));

  const { data, error } = await supabase
    .from("day_notes")
    .select("day, body, updated_at")
    .order("day", { ascending: false })
    .limit(MAX_LOCAL);

  if (error) {
    if (isMissingTable(error)) return sortDesc(readLocal(owner.userId));
    throw error;
  }

  type Row = { day: string; body: string; updated_at: string };
  return ((data ?? []) as Row[]).map((row) => ({
    day: row.day,
    body: row.body,
    updatedAt: row.updated_at,
  }));
}

export async function saveDayNote(owner: RouteOwner, day: string, body: string) {
  const trimmed = body.trim().slice(0, 80);
  if (!trimmed) return;

  if (owner.kind === "guest") {
    const list = readLocal("guest").filter((note) => note.day !== day);
    writeLocal(
      "guest",
      sortDesc([{ day, body: trimmed, updatedAt: new Date().toISOString() }, ...list]),
    );
    notify();
    return;
  }

  const { error } = await supabase.from("day_notes").upsert(
    { day, body: trimmed, updated_at: new Date().toISOString() },
    { onConflict: "user_id,day" },
  );
  if (error) {
    if (!isMissingTable(error)) throw error;
    const list = readLocal(owner.userId).filter((note) => note.day !== day);
    writeLocal(
      owner.userId,
      sortDesc([{ day, body: trimmed, updatedAt: new Date().toISOString() }, ...list]),
    );
  }
  notify();
}

export async function deleteDayNote(owner: RouteOwner, day: string) {
  if (owner.kind === "guest") {
    writeLocal("guest", readLocal("guest").filter((note) => note.day !== day));
    notify();
    return;
  }
  const { error } = await supabase.from("day_notes").delete().eq("day", day);
  if (error && !isMissingTable(error)) throw error;
  notify();
}
