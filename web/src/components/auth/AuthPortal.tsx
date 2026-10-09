"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabaseClient";
import type { SocialProvider } from "@/lib/oauth";

type Panel = "login" | "settings" | null;
type AuthView = "login" | "signup" | "signup-done";
type MenuKey = "login" | "guest" | "settings";
type Busy = "email-login" | "signup" | SocialProvider | null;

type AuthPortalProps = {
  onAuthenticated: () => void;
  onSocialLogin: (provider: SocialProvider) => Promise<string | null>;
};

const MENU: { key: MenuKey; label: string }[] = [
  { key: "login", label: "LOGIN" },
  { key: "guest", label: "GUEST" },
  { key: "settings", label: "SETTING" },
];

const SIGNUP_STEPS = 4;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const menuVariants: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.35, staggerChildren: 0.5 } },
  away: {
    opacity: 0,
    x: -16,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

const rowVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const charVariants: Variants = {
  hidden: { opacity: 0, x: -8, filter: "blur(10px)" },
  show: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: EASE_OUT },
  },
};

const whipVariants: Variants = {
  enter: { x: "112%", skewX: -16, opacity: 0, filter: "blur(22px)" },
  center: {
    x: 0,
    skewX: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      x: { type: "spring", stiffness: 190, damping: 21, mass: 0.85 },
      skewX: { type: "spring", stiffness: 190, damping: 18 },
      opacity: { duration: 0.2 },
      filter: { duration: 0.45 },
    },
  },
  exit: {
    x: "-112%",
    skewX: 16,
    opacity: 0,
    filter: "blur(22px)",
    transition: { duration: 0.42, ease: [0.7, 0, 0.84, 0] },
  },
};

const viewVariants: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: 0.38, ease: EASE_OUT } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16 } },
};

const stepVariants: Variants = {
  enter: { opacity: 0, x: 22 },
  center: { opacity: 1, x: 0, transition: { duration: 0.36, ease: EASE_OUT } },
  exit: { opacity: 0, x: -18, transition: { duration: 0.15 } },
};

function BackIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.7 15.2A8.5 8.5 0 0 1 8.8 3.3 8.5 8.5 0 1 0 20.7 15.2Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function normalizeAuthMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "아이디 또는 비밀번호를 확인해 주세요.";
  if (m.includes("email not confirmed"))
    return "이메일 인증을 먼저 완료해 주세요.";
  if (m.includes("user already registered"))
    return "이미 사용 중인 이메일입니다.";
  if (m.includes("password should be"))
    return "비밀번호는 8자 이상 입력해 주세요.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AuthPortal({ onAuthenticated, onSocialLogin }: AuthPortalProps) {
  const { theme, setTheme } = useTheme();

  const [bg, setBg] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasId = email.trim().length > 0;

  useEffect(() => {
    const n =
      typeof crypto !== "undefined" && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Date.now();
    setBg(n % 6);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, busy]);

  const steps = useMemo(
    () => [
      {
        key: "name",
        type: "text",
        value: signup.name,
        placeholder: "이름",
        autoComplete: "name",
        inputMode: "text" as const,
        set: (v: string) => setSignup((s) => ({ ...s, name: v })),
      },
      {
        key: "email",
        type: "email",
        value: signup.email,
        placeholder: "아이디 (이메일)",
        autoComplete: "email",
        inputMode: "email" as const,
        set: (v: string) => setSignup((s) => ({ ...s, email: v })),
      },
      {
        key: "password",
        type: "password",
        value: signup.password,
        placeholder: "비밀번호 (8자 이상)",
        autoComplete: "new-password",
        inputMode: "text" as const,
        set: (v: string) => setSignup((s) => ({ ...s, password: v })),
      },
      {
        key: "confirm",
        type: "password",
        value: signup.confirmPassword,
        placeholder: "비밀번호 확인",
        autoComplete: "new-password",
        inputMode: "text" as const,
        set: (v: string) => setSignup((s) => ({ ...s, confirmPassword: v })),
      },
    ],
    [signup],
  );

  const cur = steps[step];

  function showNotice(message: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 1800);
  }

  function openPanel(next: Exclude<Panel, null>) {
    setError(null);
    if (next === "login") setAuthView("login");
    setPanel(next);
  }

  function closePanel() {
    if (busy) return;
    setPanel(null);
    setError(null);
  }

  function onMenu(key: MenuKey) {
    if (panel) return;
    if (key === "guest") return showNotice("Guest 모드는 아직 준비 중이에요.");
    openPanel(key);
  }

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return setError("아이디를 입력해 주세요.");
    if (!password) return setError("비밀번호를 입력해 주세요.");

    setBusy("email-login");
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) return setError(normalizeAuthMessage(err.message));
      onAuthenticated();
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSocial(provider: SocialProvider) {
    setBusy(provider);
    setError(null);
    try {
      const message = await onSocialLogin(provider);
      if (message) setError(message);
    } catch (err) {
      console.error("소셜 로그인 시작 실패:", err);
      setError("소셜 로그인을 시작하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function validateStep() {
    if (step === 0 && signup.name.trim().length < 2)
      return "이름을 2자 이상 입력해 주세요.";
    if (step === 1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signup.email.trim()))
      return "올바른 이메일을 입력해 주세요.";
    if (step === 2 && signup.password.length < 8)
      return "비밀번호는 8자 이상 입력해 주세요.";
    if (step === 3 && signup.password !== signup.confirmPassword)
      return "비밀번호가 서로 다릅니다.";
    return null;
  }

  async function advanceSignup() {
    const invalid = validateStep();
    if (invalid) return setError(invalid);
    setError(null);

    if (step < SIGNUP_STEPS - 1) return setStep(step + 1);

    setBusy("signup");
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: signup.email.trim(),
        password: signup.password,
        options: {
          data: {
            name: signup.name.trim(),
            display_name: signup.name.trim(),
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (err) return setError(normalizeAuthMessage(err.message));
      if (data.session) return onAuthenticated();
      setAuthView("signup-done");
    } catch {
      setError("계정을 만드는 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function handleCardBack() {
    if (busy) return;

    if (panel === "login" && authView === "signup") {
      setError(null);
      if (step > 0) return setStep(step - 1);
      return setAuthView("login");
    }

    if (panel === "login" && authView === "signup-done") {
      return setAuthView("login");
    }

    closePanel();
  }

  const viewKey =
    panel === "settings"
      ? "settings"
      : authView === "signup"
        ? `signup-${step}`
        : authView;

  return (
    <main className={`san-entry san-gradient-${bg}`}>
      <div className="san-ambient" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <motion.nav
        className="san-menu"
        aria-label="SAN 메뉴"
        variants={menuVariants}
        initial="hidden"
        animate={panel ? "away" : "show"}
        style={{ pointerEvents: panel ? "none" : "auto" }}
      >
        {MENU.map((item) => (
          <motion.button
            key={item.key}
            type="button"
            tabIndex={panel ? -1 : 0}
            aria-label={item.label}
            className={`san-menu-item ${item.key === "guest" ? "is-soft" : ""}`}
            variants={rowVariants}
            whileTap={{ x: 4, scale: 0.985 }}
            onClick={() => onMenu(item.key)}
          >
            <span className="san-menu-text" aria-hidden="true">
              {Array.from(item.label).map((char, i) => (
                <motion.span key={i} variants={charVariants} className="san-menu-char">
                  {char}
                </motion.span>
              ))}
            </span>
          </motion.button>
        ))}
      </motion.nav>

      <AnimatePresence>
        {panel && (
          <motion.div
            key="scrim"
            className="san-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={closePanel}
          />
        )}

        {panel && (
          <motion.div
            key="whip"
            className="san-whip"
            variants={whipVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <section
              className="san-card"
              role="dialog"
              aria-modal="true"
              aria-label={panel === "settings" ? "화면 설정" : "로그인"}
            >
              <motion.span
                className="san-sweep"
                aria-hidden="true"
                initial={{ x: "-10%", opacity: 0.9 }}
                animate={{ x: "130%", opacity: 0 }}
                transition={{ duration: 0.9, delay: 0.08, ease: "easeOut" }}
              />

              <button
                type="button"
                className="san-icon-button san-card-back"
                onClick={handleCardBack}
                disabled={busy !== null}
                aria-label="뒤로"
              >
                <BackIcon />
              </button>

              <AnimatePresence mode="wait" initial={false}>
                {panel === "settings" && (
                  <motion.div
                    key={viewKey}
                    variants={viewVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <div className="san-theme-list">
                      {(
                        [
                          { id: "dark", name: "Dark", icon: <MoonIcon /> },
                          { id: "light", name: "Light", icon: <SunIcon /> },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className={`san-theme-option ${theme === o.id ? "is-active" : ""}`}
                          onClick={() => setTheme(o.id)}
                        >
                          <span className="san-theme-icon">{o.icon}</span>
                          <span className="san-theme-name">{o.name}</span>
                          <span className="san-theme-dot" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {panel === "login" && authView === "login" && (
                  <motion.form
                    key={viewKey}
                    variants={viewVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    onSubmit={handleEmailLogin}
                  >
                    <input
                      className="san-input"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError(null);
                      }}
                      placeholder="아이디"
                      aria-label="아이디"
                      autoComplete="email"
                      inputMode="email"
                      disabled={busy !== null}
                    />

                    <AnimatePresence initial={false}>
                      {hasId && (
                        <motion.div
                          key="pw"
                          className="san-reveal"
                          initial={{ height: 0, opacity: 0, y: -8 }}
                          animate={{ height: "auto", opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -8 }}
                          transition={{ duration: 0.45, ease: EASE_OUT }}
                        >
                          <div className="san-reveal-inner">
                            <input
                              className="san-input"
                              type="password"
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                setError(null);
                              }}
                              placeholder="비밀번호"
                              aria-label="비밀번호"
                              autoComplete="current-password"
                              disabled={busy !== null}
                            />

                            <button
                              type="submit"
                              className="san-primary"
                              disabled={busy !== null || !password}
                            >
                              {busy === "email-login" ? "..." : "로그인"}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {error && (
                      <p className="san-error" role="alert">
                        {error}
                      </p>
                    )}

                    <div className="san-divider" aria-hidden="true">
                      <span />
                    </div>

                    <SocialButtons
                      disabled={busy !== null}
                      busyProvider={busy === "google" || busy === "kakao" ? busy : null}
                      onSelect={handleSocial}
                    />

                    <button
                      type="button"
                      className="san-text-button"
                      disabled={busy !== null}
                      onClick={() => {
                        setError(null);
                        setStep(0);
                        setAuthView("signup");
                      }}
                    >
                      계정 만들기
                    </button>
                  </motion.form>
                )}

                {panel === "login" && authView === "signup" && (
                  <motion.div
                    key={viewKey}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <div className="san-progress">
                      {Array.from({ length: SIGNUP_STEPS }).map((_, i) => (
                        <span key={i} className={i <= step ? "is-on" : ""} />
                      ))}
                    </div>

                    <input
                      className="san-input"
                      type={cur.type}
                      value={cur.value}
                      onChange={(e) => {
                        cur.set(e.target.value);
                        setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void advanceSignup();
                        }
                      }}
                      placeholder={cur.placeholder}
                      aria-label={cur.placeholder}
                      autoComplete={cur.autoComplete}
                      inputMode={cur.inputMode}
                      autoFocus
                      disabled={busy !== null}
                    />

                    {error && (
                      <p className="san-error" role="alert">
                        {error}
                      </p>
                    )}

                    <button
                      type="button"
                      className="san-primary"
                      disabled={busy !== null}
                      onClick={() => void advanceSignup()}
                    >
                      {busy === "signup"
                        ? "..."
                        : step === SIGNUP_STEPS - 1
                          ? "가입"
                          : "다음"}
                    </button>
                  </motion.div>
                )}

                {panel === "login" && authView === "signup-done" && (
                  <motion.div
                    key={viewKey}
                    className="san-done"
                    variants={viewVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <div className="san-done-mark" aria-hidden="true">
                      <svg viewBox="0 0 48 48" fill="none">
                        <path
                          d="m13 25 7 7 15-17"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    <p className="san-done-text">이메일을 확인해 주세요</p>

                    <button
                      type="button"
                      className="san-primary"
                      onClick={() => {
                        setAuthView("login");
                        setEmail(signup.email);
                        setPassword("");
                      }}
                    >
                      로그인
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.footer
        className="san-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: panel ? 0 : 1 }}
        transition={{ duration: 0.4, delay: panel ? 0 : 2.6 }}
      >
        SAN
      </motion.footer>

      <AnimatePresence>
        {notice && (
          <motion.div
            key="notice"
            className="san-notice"
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}