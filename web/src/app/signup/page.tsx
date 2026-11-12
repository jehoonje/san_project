// web/src/app/signup/page.tsx
// 가입은 로그인 화면(AuthPortal) 안에서 이어집니다. 예전 주소는 그쪽으로 보냅니다.
import { redirect } from "next/navigation";

export default function SignupPage() {
  redirect("/login");
}
