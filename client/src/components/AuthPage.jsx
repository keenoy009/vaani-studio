import { useRef, useState } from "react";
import { api } from "../api.js";

const CHIPS = ["ಕನ್ನಡ", "தமிழ்", "తెలుగు", "मराठी", "മലയാളം", "বাংলা", "ગુજરાતી", "ਪੰਜਾਬੀ", "हिन्दी", "English"];
const BARS = [28, 46, 34, 62, 44, 78, 52, 92, 60, 100, 70, 88, 58, 76, 48, 64, 38, 52, 30, 42, 26, 36];

function Icon({ d, size = 18, sw = 1.9 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const BULLETS = [
  ["10 Indian languages", "Dub one video into Kannada, Tamil, Telugu, Marathi and more, each in one click.", "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 0 0 18"],
  ["A voice for every speaker", "Choose a studio voice, or match the original speaker, with their permission.", "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"],
  ["Deliver on Telegram", "Send a video to the bot in a chat or a group and get the dub back.", "M21 3 10 14M21 3l-7 18-4-7-7-4z"],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Same rules the server enforces, so people get instant feedback (the server still checks everything).
function validate(mode, f) {
  const e = {};
  if (mode === "signup") { const n = f.name.trim().replace(/\s+/g, " "); if (n.length < 2 || n.length > 60) e.name = "Please enter your name (2–60 characters)."; }
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Please enter a valid email address.";
  if (mode === "login") { if (!f.password) e.password = "Please enter your password."; }
  else if (f.password.length < 8) e.password = "Use at least 8 characters.";
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = "Include at least one letter and one number.";
  return e;
}
function strength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw) || pw.length < 8) s = Math.min(s, 1);
  return Math.max(1, Math.min(4, s));
}
const S_LABEL = ["", "Weak", "Fair", "Good", "Strong"], S_COLOR = ["#262B40", "#FFA6E7", "#FFB68F", "#A99BFF", "#6EE7B7"];

function Field({ id, label, error, hint, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-bold">{label}</label>
      {children}
      {error && <p id={`${id}-err`} role="alert" className="m-0 flex items-center gap-1.5 text-xs font-medium text-pink"><Icon d="M12 8v5M12 16.5v.01M12 3l10 18H2z" size={13} />{error}</p>}
      {hint}
    </div>
  );
}
const inputCls = (bad) => `h-12 w-full rounded-2xl border bg-well px-4 text-[15px] text-ink placeholder:text-[#5E6683] transition-colors ${bad ? "border-pink/70" : "border-[#2C3247] hover:border-[#3B4263]"}`;

export default function AuthPage({ onAuthed, signupOpen = true }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [f, setF] = useState({ name: "", email: "", password: "", remember: false });
  const [touched, setTouched] = useState({});
  const [serverErr, setServerErr] = useState({});
  const [banner, setBanner] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  // Live checks, plus anything the server told us. (A cleared server message must NOT wipe out a live check.)
  const errors = validate(mode, f);
  for (const k of Object.keys(serverErr)) if (serverErr[k]) errors[k] = serverErr[k];
  const visible = (k) => (touched[k] || serverErr[k] ? errors[k] : undefined);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value })); setServerErr((s) => ({ ...s, [k]: undefined })); setBanner(""); };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const switchMode = (m) => { setMode(m); setTouched({}); setServerErr({}); setBanner(""); setShow(false); setF((x) => ({ ...x, password: "", remember: m === "signup" })); };
  const sc = strength(f.password);

  async function submit(e) {
    e.preventDefault();
    setBanner("");
    setTouched({ name: true, email: true, password: true });
    const errs = validate(mode, f);
    if (Object.keys(errs).length) { formRef.current?.querySelector(`[name="${Object.keys(errs)[0]}"]`)?.focus(); return; }
    setBusy(true);
    try {
      const d = mode === "login" ? await api.login(f.email.trim(), f.password, f.remember) : await api.signup(f.name.trim(), f.email.trim(), f.password, f.remember);
      onAuthed(d.user);
    } catch (err) {
      if (["name", "email", "password"].includes(err.field)) { setServerErr({ [err.field]: err.message }); formRef.current?.querySelector(`[name="${err.field}"]`)?.focus(); }
      else setBanner(err.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <div className="grid min-h-screen grid-cols-[1.08fr_1fr] bg-bg max-lg:grid-cols-1">
      {/* ---------- brand panel ---------- */}
      <aside className="relative flex flex-col justify-between overflow-hidden border-r border-line p-14 max-lg:hidden"
        style={{ background: "radial-gradient(700px 480px at 0% 0%, rgba(139,123,255,0.40), transparent 62%), radial-gradient(640px 520px at 100% 100%, rgba(255,166,231,0.26), transparent 62%), #0B0C14" }}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8B7BFF] to-[#C8BFFF]">
            <Icon d="M5 9v6M9.5 5v14M14.5 8v8M19 10.5v3" size={22} sw={2.6} />
          </span>
          <span className="text-lg font-extrabold tracking-[-0.02em]">Vaani Studio</span>
        </div>

        <div className="flex max-w-[520px] flex-col gap-9">
          <div className="flex flex-col gap-4">
            <h1 className="m-0 text-[44px] leading-[1.08] font-extrabold tracking-[-0.035em]">Dub any video into the languages your audience speaks.</h1>
            <p className="m-0 text-base leading-relaxed text-[#B7BED3]">Upload once. Review the translation, choose a voice, and share the dubbed video with the people who need it.</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-5 p-0">
            {BULLETS.map(([t, d, icon]) => (
              <li key={t} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#CFC7FF]"><Icon d={icon} /></span>
                <span className="flex flex-col gap-0.5"><span className="text-[15px] font-bold">{t}</span><span className="text-sm leading-relaxed text-[#9AA3B8]">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-6">
          <div className="wv on" style={{ height: 70, gap: 5, color: "#C8BFFF" }} aria-hidden="true">
            {BARS.map((h, i) => <i key={i} style={{ height: `${h}%`, width: 5, animationDelay: `${(i * 0.07).toFixed(2)}s`, background: i % 3 === 0 ? "#FFA6E7" : "#A99BFF" }} />)}
          </div>
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            {CHIPS.map((c) => <span key={c} className="rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-[13px] font-semibold text-[#D8DCEA]">{c}</span>)}
          </div>
          <p className="m-0 text-xs text-[#6B7390]">Built on Gnani AI Prisma (speech-to-text) and Timbre (text-to-speech).</p>
        </div>
      </aside>

      {/* ---------- form ---------- */}
      <main className="flex items-center justify-center px-6 py-10 max-sm:px-4"
        style={{ background: "radial-gradient(520px 340px at 85% 0%, rgba(139,123,255,0.10), transparent 70%), #07080C" }}>
        <div className="flex w-full max-w-[440px] flex-col gap-7">
          <div className="hidden items-center gap-3 max-lg:flex">
            <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#8B7BFF] to-[#C8BFFF]"><Icon d="M5 9v6M9.5 5v14M14.5 8v8M19 10.5v3" size={20} sw={2.6} /></span>
            <span className="text-lg font-extrabold tracking-[-0.02em]">Vaani Studio</span>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.03em]">{isLogin ? "Welcome back" : "Create your account"}</h2>
            <p className="m-0 text-[15px] text-mute">{isLogin ? "Sign in to continue to your studio." : "Start dubbing videos into 10 Indian languages."}</p>
          </div>

          {signupOpen && (
            <div role="tablist" aria-label="Sign in or sign up" className="grid grid-cols-2 rounded-full bg-[#171A25] p-1">
              {[["login", "Sign in"], ["signup", "Create account"]].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => switchMode(id)}
                  className="h-10 rounded-full border-0 text-sm font-bold" style={{ background: mode === id ? "#F1F3FA" : "transparent", color: mode === id ? "#0B0A18" : "#9AA3B8" }}>{label}</button>
              ))}
            </div>
          )}

          <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
            {banner && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
                <Icon d="M12 8v5M12 16.5v.01M12 3l10 18H2z" size={17} /><span>{banner}</span>
              </div>
            )}

            {!isLogin && (
              <Field id="name" label="Full name" error={visible("name")}>
                <input id="name" name="name" value={f.name} onChange={set("name")} onBlur={blur("name")} autoComplete="name" placeholder="Asha Rao" maxLength={60}
                  aria-invalid={!!visible("name")} aria-describedby={visible("name") ? "name-err" : undefined} className={inputCls(visible("name"))} />
              </Field>
            )}

            <Field id="email" label="Email" error={visible("email")}>
              <input id="email" name="email" type="email" inputMode="email" value={f.email} onChange={set("email")} onBlur={blur("email")} autoComplete="email" placeholder="you@example.com" maxLength={254}
                aria-invalid={!!visible("email")} aria-describedby={visible("email") ? "email-err" : undefined} className={inputCls(visible("email"))} />
            </Field>

            <Field id="password" label="Password" error={visible("password")}
              hint={!isLogin && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1.5" aria-hidden="true">{[1, 2, 3, 4].map((i) => <span key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i <= sc ? S_COLOR[sc] : "#262B40" }} />)}</div>
                  <p className="m-0 flex justify-between text-xs text-mute"><span>{visible("password") ? "" : "At least 8 characters, with a letter and a number."}</span><span className="font-bold" style={{ color: S_COLOR[sc] }} aria-live="polite">{S_LABEL[sc]}</span></p>
                </div>
              )}>
              <div className="relative">
                <input id="password" name="password" type={show ? "text" : "password"} value={f.password} onChange={set("password")} onBlur={blur("password")}
                  onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} autoComplete={isLogin ? "current-password" : "new-password"} placeholder={isLogin ? "Your password" : "Create a password"} maxLength={128}
                  aria-invalid={!!visible("password")} aria-describedby={visible("password") ? "password-err" : undefined} className={`${inputCls(visible("password"))} pr-12`} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                  className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent p-0 text-mute hover:text-ink">
                  <Icon d={show ? "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4 9.5 7a11 11 0 0 1-2.6 3.8M6.2 6.2A11 11 0 0 0 2.5 12c1 3 4.5 7 9.5 7 1.5 0 2.9-.4 4.1-1" : "M2.5 12C3.5 9 7 5 12 5s8.5 4 9.5 7c-1 3-4.5 7-9.5 7s-8.5-4-9.5-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"} size={19} />
                </button>
              </div>
              {caps && <p className="m-0 mt-1.5 text-xs text-peach">Caps Lock is on.</p>}
            </Field>

            <label className="flex cursor-pointer items-center gap-3 text-sm text-[#C9CFE0]">
              <input type="checkbox" checked={f.remember} onChange={set("remember")} className="m-0 h-[18px] w-[18px] accent-[#A99BFF]" />
              Keep me signed in for 30 days
            </label>

            <button type="submit" disabled={busy}
              className="flex h-[54px] items-center justify-center gap-2.5 rounded-full border-0 text-[15px] font-extrabold text-[#0B0A18] disabled:opacity-80"
              style={{ background: "linear-gradient(90deg,#A99BFF,#FFA6E7)", boxShadow: "0 10px 30px rgba(169,155,255,0.28)" }}>
              {busy && <span className="spin h-4 w-4 rounded-full border-2 border-[#0B0A18]/30 border-t-[#0B0A18]" />}
              {busy ? (isLogin ? "Signing in…" : "Creating your account…") : isLogin ? "Sign in" : "Create account"}
              {!busy && <Icon d="M5 12h14M13 6l6 6-6 6" size={18} sw={2.4} />}
            </button>
          </form>

          {isLogin
            ? <p className="m-0 text-center text-[13px] leading-relaxed text-[#6B7390]">Forgot your password? Ask the workspace owner to reset it.</p>
            : <p className="m-0 text-center text-xs leading-relaxed text-[#6B7390]">By creating an account you confirm you will only dub content you have the right to use, and copy a speaker’s voice only with their permission.</p>}
          {signupOpen && (
            <p className="m-0 text-center text-sm text-mute">
              {isLogin ? "New to Vaani Studio?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => switchMode(isLogin ? "signup" : "login")} className="border-0 bg-transparent p-0 text-sm font-bold text-lav underline-offset-4 hover:underline">{isLogin ? "Create an account" : "Sign in"}</button>
            </p>
          )}
          {!signupOpen && <p className="m-0 text-center text-sm text-mute">New accounts are closed on this server. Ask the workspace owner for access.</p>}
        </div>
      </main>
    </div>
  );
}
