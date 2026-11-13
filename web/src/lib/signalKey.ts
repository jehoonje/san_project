// web/src/lib/signalKey.ts
// 재식별 토큰: 교차한 상대만 건네받는 안정 키.
// 계정 id에서 유도되지 않는 난수라, 이 값으로 계정을 되짚을 수 없습니다.
import { supabase } from "@/lib/supabaseClient";
import { isMissingTable } from "@/lib/circles";

let cached: string | null = null;

/** 내 토큰. 아직 없거나 읽지 못하면 null (그러면 재식별을 하지 않습니다) */
export async function mySignalKey(): Promise<string | null> {
  if (cached) return cached;

  const { data, error } = await supabase
    .from("profiles")
    .select("signal_key")
    .maybeSingle();

  if (error) {
    if (!isMissingTable(error)) console.error("신호 토큰 조회 실패:", error);
    return null;
  }

  const key = (data as { signal_key?: string } | null)?.signal_key ?? null;
  cached = key;
  return key;
}

/** 지금까지 스친 사람들과의 연결을 끊습니다 */
export async function rotateSignalKey(): Promise<string | null> {
  const next = crypto.randomUUID();
  const { error } = await supabase
    .from("profiles")
    .update({ signal_key: next })
    .select("signal_key")
    .maybeSingle();

  if (error) {
    console.error("신호 토큰 교체 실패:", error);
    return cached;
  }
  cached = next;
  return next;
}
