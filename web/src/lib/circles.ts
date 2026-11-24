// web/src/lib/circles.ts
// 동행 서클: 3~8명의 작은 묶음.
// 서클에서는 둘이 같은 서클에 있게 된 뒤의 걸음만 서로에게 보입니다.
// 그 전의 기록은 열리지 않고, 나가면 그 순간부터 아무것도 보이지 않습니다.
import { supabase } from "@/lib/supabaseClient";
import type { SavedRoute } from "@/types/route";

export const CIRCLE_MAX = 8;

export type CircleMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
};

export type Circle = {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  members: CircleMember[];
};

const EVENT = "san-circles-change";

export function onCirclesChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 테이블·함수가 아직 없는 환경(마이그레이션 전)에서도 앱이 멈추지 않게 */
export function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    /does not exist|not find/i.test(error.message ?? "")
  );
}

type RosterRow = {
  circle_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
};

type CircleRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

/**
 * 내가 속한 서클. 테이블이나 함수가 없으면 빈 목록.
 * 사람들의 이름과 얼굴은 전용 함수가 그 두 칸만 내어 줍니다.
 */
export async function listCircles(): Promise<Circle[]> {
  const [circleResult, rosterResult] = await Promise.all([
    supabase
      .from("circles")
      .select("id, name, invite_code, created_by")
      .order("created_at", { ascending: true }),
    supabase.rpc("circle_roster"),
  ]);

  const failure = circleResult.error ?? rosterResult.error;
  if (failure) {
    if (isMissingTable(failure)) return [];
    throw failure;
  }

  const byCircle = new Map<string, CircleMember[]>();
  for (const row of (rosterResult.data ?? []) as RosterRow[]) {
    const list = byCircle.get(row.circle_id) ?? [];
    list.push({
      userId: row.user_id,
      displayName: row.display_name?.trim() || "산책자",
      avatarUrl: row.avatar_url?.trim() || null,
      joinedAt: row.joined_at,
    });
    byCircle.set(row.circle_id, list);
  }

  return ((circleResult.data ?? []) as CircleRow[])
    // 만들기만 하고 들어가 있지 않은 서클은 목록에 두지 않습니다
    .filter((row) => byCircle.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      inviteCode: row.invite_code,
      createdBy: row.created_by,
      members: (byCircle.get(row.id) ?? []).sort((a, b) =>
        a.joinedAt.localeCompare(b.joinedAt),
      ),
    }));
}

function makeInviteCode() {
  // 헷갈리는 글자(0/O, 1/I)는 뺍니다.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function createCircle(name: string): Promise<string> {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) throw new Error("name_required");

  // 코드가 겹치면 몇 번 더 뽑아 봅니다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("circles")
      .insert({ name: trimmed, invite_code: makeInviteCode() })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") continue; // 코드 중복
      throw error;
    }

    const circleId = (data as { id: string }).id;
    const { error: joinError } = await supabase
      .from("circle_members")
      .insert({ circle_id: circleId });

    if (joinError) {
      // 들어가지 못한 서클은 남기지 않습니다
      await supabase.from("circles").delete().eq("id", circleId);
      throw joinError;
    }

    notify();
    return circleId;
  }
  throw new Error("invite_code_conflict");
}

/** 초대 코드로 참여. 없는 코드나 정원 초과면 사유를 담아 던집니다. */
export async function joinCircle(code: string): Promise<string> {
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(trimmed)) throw new Error("circle_not_found");

  const { data, error } = await supabase.rpc("join_circle_by_code", {
    p_code: trimmed,
  });

  if (error) {
    if (/circle_not_found/.test(error.message)) throw new Error("circle_not_found");
    if (/circle_full/.test(error.message)) throw new Error("circle_full");
    throw error;
  }
  notify();
  return data as string;
}

/** 내가 나가거나(본인), 만든 사람이 내보냅니다 */
export async function leaveCircle(circleId: string, userId: string) {
  const { error } = await supabase
    .from("circle_members")
    .delete()
    .eq("circle_id", circleId)
    .eq("user_id", userId);
  if (error) throw error;
  notify();
}

/** 초대 코드를 새로 뽑습니다 (만든 사람만). 예전 코드로는 더 들어올 수 없습니다. */
export async function renewInviteCode(circleId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = makeInviteCode();
    const { data, error } = await supabase
      .from("circles")
      .update({ invite_code: next })
      .eq("id", circleId)
      .select("invite_code");

    if (error) {
      if (error.code === "23505") continue;
      throw error;
    }
    if (!data?.length) throw new Error("not_owner");
    notify();
    return next;
  }
  throw new Error("invite_code_conflict");
}

/** 서클에서 함께 걷는 사람들 (나 제외). 장소를 건넬 상대 목록 */
export function circleMates(circles: Circle[], myId: string): CircleMember[] {
  const seen = new Map<string, CircleMember>();
  for (const circle of circles) {
    for (const member of circle.members) {
      if (member.userId !== myId) seen.set(member.userId, member);
    }
  }
  return [...seen.values()];
}

/**
 * 서클 사람의 걸음.
 * 둘이 같은 서클에 있게 된 뒤에 시작한 걸음만 내려옵니다 (서버에서 거릅니다).
 */
export async function listCircleWalks(userId: string): Promise<SavedRoute[]> {
  const { data, error } = await supabase.rpc("circle_walks", {
    p_user: userId,
    p_limit: 20,
  });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const rows = Array.isArray(data) ? (data as SavedRoute[]) : [];
  return rows.map((row) => ({
    ...row,
    distance_meters: row.distance_meters == null ? null : Number(row.distance_meters),
    coordinates: Array.isArray(row.coordinates) ? row.coordinates : [],
    route_places: Array.isArray(row.route_places) ? row.route_places : [],
  }));
}
