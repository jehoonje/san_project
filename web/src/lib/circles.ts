// web/src/lib/circles.ts
// 동행 서클: 3~8명의 작은 묶음. 서클 안에서만 서로의 걸음과 장소가 보입니다.
// 서클 밖으로는 아무것도 열리지 않고, 나가면 그 순간부터 보이지 않습니다.
import { supabase } from "@/lib/supabaseClient";

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

/** 테이블이 아직 없는 환경(마이그레이션 전)에서도 앱이 멈추지 않게 */
export function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    /does not exist|not find/i.test(error.message ?? "")
  );
}

type MemberRow = {
  user_id: string;
  joined_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

type CircleRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  circle_members: MemberRow[] | null;
};

function fromRow(row: CircleRow): Circle {
  const members = (row.circle_members ?? []).map((member) => ({
    userId: member.user_id,
    displayName: member.profiles?.display_name?.trim() || "산책자",
    avatarUrl: member.profiles?.avatar_url ?? null,
    joinedAt: member.joined_at,
  }));
  members.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    createdBy: row.created_by,
    members,
  };
}

/** 내가 속한 서클. 테이블이 없으면 빈 목록 */
export async function listCircles(): Promise<Circle[]> {
  const { data, error } = await supabase
    .from("circles")
    .select(
      `id, name, invite_code, created_by,
       circle_members ( user_id, joined_at, profiles ( display_name, avatar_url ) )`,
    )
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as CircleRow[]).map(fromRow);
}

function makeInviteCode() {
  // 헷갈리는 글자(0/O, 1/I)는 뺍니다.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function createCircle(name: string): Promise<Circle> {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) throw new Error("name_required");

  // 코드가 겹치면 몇 번 더 뽑아 봅니다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("circles")
      .insert({ name: trimmed, invite_code: makeInviteCode() })
      .select("id, name, invite_code, created_by")
      .single();

    if (error) {
      if (error.code === "23505") continue; // 코드 중복
      throw error;
    }

    const row = data as Omit<CircleRow, "circle_members">;
    const { error: joinError } = await supabase
      .from("circle_members")
      .insert({ circle_id: row.id });
    if (joinError) throw joinError;

    notify();
    return fromRow({ ...row, circle_members: [] });
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

export async function leaveCircle(circleId: string, userId: string) {
  const { error } = await supabase
    .from("circle_members")
    .delete()
    .eq("circle_id", circleId)
    .eq("user_id", userId);
  if (error) throw error;
  notify();
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
