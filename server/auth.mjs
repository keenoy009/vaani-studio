// Accounts, sessions and request protection for Vaani Studio.
//
//  - Passwords: scrypt (memory-hard) with a random salt per user; compared in constant time. Never stored or logged in clear.
//  - Sessions: a random 256-bit token in an HttpOnly, SameSite=Lax cookie. Only its SHA-256 hash is stored on the server,
//    so a leaked auth.json cannot be used to impersonate anyone.
//  - Login is throttled (per account+address, and per address) and always answers "incorrect email or password",
//    with equal work for unknown emails, so accounts cannot be probed.
//  - State-changing requests from another website are refused (Origin check) on top of SameSite cookies.
//  - Data lives in work/auth.json (single-server file storage). A larger deployment would swap `db` for a real database.
import { randomBytes, scrypt, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Router } from "express";

const scryptAsync = promisify(scrypt);
const AUTH_FILE = resolve(process.env.AUTH_FILE || "work/auth.json");
const COOKIE = "vaani_session";
const SESSION_SHORT_MS = 24 * 3600_000;      // browser session without "remember me"
const SESSION_LONG_MS = 30 * 24 * 3600_000;  // with "remember me"
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== "false";
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

/** Random secret that only this server process and the Telegram bot (same process) know. Lets the bot call the API. */
export const INTERNAL_KEY = process.env.INTERNAL_KEY && process.env.INTERNAL_KEY.length >= 24 ? process.env.INTERNAL_KEY : randomBytes(24).toString("hex");

// ---------------- storage ----------------
let db = { users: [], sessions: [] };
let writing = Promise.resolve();
export async function initAuth() {
  try { db = JSON.parse(await readFile(AUTH_FILE, "utf8")); } catch { /* first run */ }
  db.users ??= []; db.sessions ??= [];
  db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
  DUMMY_HASH = await hashPassword("not-a-real-password-just-for-timing");
}
function persist() {
  writing = writing.then(async () => {
    await mkdir(dirname(AUTH_FILE), { recursive: true });
    const tmp = `${AUTH_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    await rename(tmp, AUTH_FILE); // atomic replace: a crash never leaves a half-written file
  }).catch((e) => console.error("[auth] could not save:", e.message));
  return writing;
}

// ---------------- passwords ----------------
let DUMMY_HASH = "";
async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}
async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hash, "base64");
  const got = await scryptAsync(pw, Buffer.from(salt, "base64"), want.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}

const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123", "iloveyou", "admin123", "welcome1", "letmein123", "abc12345", "11111111", "00000000"]);
export function passwordProblem(pw, email = "") {
  if (typeof pw !== "string") return "Please enter a password.";
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 128) return "That password is too long (128 characters at most).";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common. Please choose another.";
  const local = email.split("@")[0];
  if (local.length >= 4 && pw.toLowerCase().includes(local.toLowerCase())) return "Don't use your email name in your password.";
  return null;
}
const cleanEmail = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const cleanName = (n) => (typeof n === "string" ? n.trim().replace(/\s+/g, " ") : "");

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt });

// ---------------- throttling ----------------
const fails = new Map(); // key -> { n, first, lockedUntil }
const WINDOW_MS = 15 * 60_000, LOCK_MS = 15 * 60_000;
function lockedMinutes(key) { const e = fails.get(key); return e && e.lockedUntil > Date.now() ? Math.ceil((e.lockedUntil - Date.now()) / 60_000) : 0; }
function recordFail(key, max) {
  const now = Date.now();
  let e = fails.get(key);
  if (!e || now - e.first > WINDOW_MS) e = { n: 0, first: now, lockedUntil: 0 };
  e.n++;
  if (e.n >= max) e.lockedUntil = now + LOCK_MS;
  fails.set(key, e);
}
const clearFails = (key) => fails.delete(key);
setInterval(() => { const now = Date.now(); for (const [k, e] of fails) if (now - e.first > WINDOW_MS && e.lockedUntil < now) fails.delete(k); }, 10 * 60_000).unref();
const signups = new Map(); // ip -> timestamps
function signupAllowed(ip) {
  const now = Date.now(), list = (signups.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 10) return false;
  list.push(now); signups.set(ip, list); return true;
}

// ---------------- sessions & cookies ----------------
const sha = (s) => createHash("sha256").update(s).digest("hex");
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore a malformed cookie */ } }
  }
  return out;
}
const isSecure = (req) => req.secure || req.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
function setCookie(res, req, token, remember) {
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (remember) parts.push(`Max-Age=${SESSION_LONG_MS / 1000}`);
  if (isSecure(req)) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}
const clearCookie = (res, req) => res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? "; Secure" : ""}`);

async function startSession(res, req, user, remember) {
  const token = randomBytes(32).toString("base64url");
  db.sessions.push({ tokenHash: sha(token), userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (remember ? SESSION_LONG_MS : SESSION_SHORT_MS) });
  setCookie(res, req, token, remember);
  await persist();
}

// ---------------- middleware ----------------
export function securityHeaders(req, res, next) {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", "Cross-Origin-Opener-Policy": "same-origin" });
  next();
}
// Hosts that may legitimately call the API from a browser, in addition to the host the request arrived on.
// A reverse proxy (or the Vite dev proxy) passes the visitor's host in X-Forwarded-Host; ALLOWED_ORIGINS can add more (comma-separated).
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => { try { return new URL(s).host; } catch { return s; } });
/**
 * Refuse state-changing requests that a DIFFERENT website made from the user's browser (cross-site request forgery).
 * A browser always sends an Origin header on such requests, and another site cannot fake it or add X-Forwarded-Host
 * without a CORS preflight, which this server never approves. Requests with no Origin (curl, the bot) are not browser-driven.
 */
export function sameOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { return res.status(403).json({ error: "Blocked a request from another website." }); }
    const ok = [req.get("host"), req.get("x-forwarded-host"), ...EXTRA_ORIGINS].filter(Boolean).includes(host);
    if (!ok) return res.status(403).json({ error: "Blocked a request from another website." });
  }
  next();
}
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
/** Sets req.user: the signed-in person, or the built-in "system" user for the Telegram bot (via X-Internal-Key), or null. */
export function authenticate(req, res, next) {
  req.user = null; req.sessionHash = null;
  const key = req.get("x-internal-key");
  if (key && safeEqual(key, INTERNAL_KEY)) { req.user = { id: "telegram", name: "Telegram bot", role: "system" }; return next(); }
  const token = parseCookies(req)[COOKIE];
  if (token) {
    const h = sha(token);
    const s = db.sessions.find((x) => x.tokenHash === h && x.expiresAt > Date.now());
    const u = s && db.users.find((x) => x.id === s.userId);
    if (u) { req.user = publicUser(u); req.sessionHash = h; }
  }
  next();
}
export const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Please sign in to continue.", code: "UNAUTHENTICATED" }));

/** Who may open a job: its owner; the system (Telegram bot); and the workspace owner for the bot's and older jobs. */
export const canSee = (user, job) => !!user && (user.role === "system" || job.ownerId === user.id || (user.role === "owner" && (!job.ownerId || job.ownerId === "telegram")));

// ---------------- routes ----------------
export const authRouter = Router();
authRouter.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

authRouter.post("/signup", async (req, res) => {
  if (!ALLOW_SIGNUP) return res.status(403).json({ error: "Sign-ups are closed on this server." });
  const name = cleanName(req.body?.name), email = cleanEmail(req.body?.email), password = req.body?.password;
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Please enter your name (2–60 characters).", field: "name" });
  if (!validEmail(email)) return res.status(400).json({ error: "Please enter a valid email address.", field: "email" });
  const problem = passwordProblem(password, email);
  if (problem) return res.status(400).json({ error: problem, field: "password" });
  if (!signupAllowed(req.ip)) return res.status(429).json({ error: "Too many sign-ups from this network. Please try again later." });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: "An account with this email already exists. Try signing in.", field: "email" });
  const user = { id: randomUUID(), name, email, passwordHash: await hashPassword(password), role: db.users.length === 0 ? "owner" : "member", createdAt: new Date().toISOString() };
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: "An account with this email already exists. Try signing in.", field: "email" }); // lost a race
  db.users.push(user);
  await startSession(res, req, user, !!req.body?.remember);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const email = cleanEmail(req.body?.email), password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password || password.length > 1024) return res.status(400).json({ error: "Enter your email and password." });
  const keyAccount = `acct:${req.ip}|${email}`, keyIp = `ip:${req.ip}`;
  const wait = Math.max(lockedMinutes(keyAccount), lockedMinutes(keyIp));
  if (wait) return res.status(429).json({ error: `Too many attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.`, code: "RATE_LIMITED" });
  const user = db.users.find((u) => u.email === email);
  const ok = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH); // same work whether or not the email exists
  if (!user || !ok) {
    recordFail(keyAccount, 5); recordFail(keyIp, 20);
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  clearFails(keyAccount);
  await startSession(res, req, user, !!req.body?.remember);
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", async (req, res) => {
  if (req.sessionHash) { db.sessions = db.sessions.filter((s) => s.tokenHash !== req.sessionHash); await persist(); }
  clearCookie(res, req);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => (req.user && req.user.role !== "system"
  ? res.json({ user: req.user, signupOpen: ALLOW_SIGNUP })
  : res.status(401).json({ error: "Not signed in.", code: "UNAUTHENTICATED", signupOpen: ALLOW_SIGNUP })));

// Change password: needs the current one; signs out all OTHER devices.
authRouter.patch("/password", async (req, res) => {
  if (!req.user || req.user.role === "system") return res.status(401).json({ error: "Please sign in to continue.", code: "UNAUTHENTICATED" });
  const key = `pw:${req.user.id}`;
  if (lockedMinutes(key)) return res.status(429).json({ error: "Too many attempts. Please try again in a few minutes." });
  const user = db.users.find((u) => u.id === req.user.id);
  const { current, next } = req.body ?? {};
  if (typeof current !== "string" || !(await verifyPassword(current, user.passwordHash))) {
    recordFail(key, 5);
    return res.status(400).json({ error: "Your current password is not correct.", field: "current" });
  }
  const problem = passwordProblem(next, user.email);
  if (problem) return res.status(400).json({ error: problem, field: "next" });
  user.passwordHash = await hashPassword(next);
  db.sessions = db.sessions.filter((s) => s.userId !== user.id || s.tokenHash === req.sessionHash);
  clearFails(key);
  await persist();
  res.json({ ok: true });
});

/** Used by scripts/reset-password.mjs (the owner's way to help someone who forgot their password). */
export async function resetPassword(email, newPassword) {
  const user = db.users.find((u) => u.email === cleanEmail(email));
  if (!user) return { ok: false, error: "No account with that email." };
  const problem = passwordProblem(newPassword, user.email);
  if (problem) return { ok: false, error: problem };
  user.passwordHash = await hashPassword(newPassword);
  db.sessions = db.sessions.filter((s) => s.userId !== user.id); // sign them out everywhere
  await persist();
  return { ok: true };
}
