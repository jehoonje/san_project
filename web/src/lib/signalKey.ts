// web/src/lib/signalKey.ts
// 재식별 토큰: 서로 인사를 주고받은 상대만 건네받는 값.
// 계정 id에서 유도되지 않는 난수라, 이 값으로 계정을 되짚을 수 없습니다.
// 본인만 읽는 전용 테이블(signal_keys)에 두고, 꺼 두면 건네지도 받아 적지도 않습니다.
import { supabase } from "@/lib/supabaseClient";
import { isMissingTable } from "@/lib/circles";

export type SignalMemory = {
  /** 테이블이 준비되어 있는지 (없으면 재식별 자체가 꺼진 것으로 봅니다) */
  available: boolean;
  /** 다시 스친 사람을 서로 알아볼지 */
  enabled: boolean;
  token: string | null;
};

const OFF: SignalMemory = { available: false, enabled: false, token: null };
const EVENT = "san-signal-memory-change";

let cache: { userId: string; value: SignalMemory } | null = null;

export function onSignalMemoryChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

function remember(userId: string, value: SignalMemory) {
  cache = { userId, value };
  return value;
}

type Row = { token: string; enabled: boolean };

/** 내 설정과 토큰. 행이 없으면 만들어 둡니다. */
export async function loadSignalMemory(
  userId: string,
  fresh = false,
): Promise<SignalMemory> {
  if (!fresh && cache?.userId === userId) return cache.value;

  const read = () =>
    supabase
      .from("signal_keys")
      .select("token, enabled")
      .eq("user_id", userId)
      .maybeSingle();

  let { data, error } = await read();

  if (!error && !data) {
    // 처음: 토큰은 서버가 뽑습니다
    const created = await supabase
      .from("signal_keys")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (created.error) {
      error = created.error;
    } else {
      ({ data, error } = await read());
    }
  }

  if (error || !data) {
    if (error && !isMissingTable(error)) {
      console.error("신호 토큰 조회 실패:", error);
    }
    // 실패는 기억하지 않습니다 (다음에 다시 물어봅니다)
    return OFF;
  }

  const row = data as Row;
  return remember(userId, {
    available: true,
    enabled: row.enabled,
    token: row.enabled ? row.token : null,
  });
}

/** 건넬 토큰. 꺼 두었거나 읽지 못하면 null (그러면 건네지도 받아 적지도 않습니다) */
export async function mySignalKey(userId: string): Promise<string | null> {
  return (await loadSignalMemory(userId)).token;
}

/**
 * 다시 스친 사람 알아보기를 켜거나 끕니다.
 * 끌 때는 토큰도 새로 뽑아, 그동안 내 토큰을 받아 둔 사람들이 나를 더는 알아보지 못합니다.
 */
export async function setSignalMemory(
  userId: string,
  enabled: boolean,
): Promise<SignalMemory> {
  const patch: Record<string, unknown> = { enabled };
  if (!enabled) {
    patch.token = crypto.randomUUID();
    patch.rotated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("signal_keys")
    .update(patch)
    .eq("user_id", userId)
    .select("token, enabled")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("signal_key_missing");

  const row = data as Row;
  const next = remember(userId, {
    available: true,
    enabled: row.enabled,
    token: row.enabled ? row.token : null,
  });
  window.dispatchEvent(new CustomEvent(EVENT));
  return next;
}
