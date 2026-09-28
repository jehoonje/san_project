// web/src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] 환경변수가 설정되지 않았습니다. " +
      ".env.local (로컬) 또는 Vercel 프로젝트 설정 (배포)에 " +
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 추가하세요."
  );
}

// 환경변수가 없어도 빌드/프리렌더 자체는 통과시키고,
// 실제 호출 시점(런타임)에만 Supabase 에러가 나도록 더미 값을 fallback으로 사용.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key"
);