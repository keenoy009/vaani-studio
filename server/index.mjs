// Vaani Studio backend.
// Run:  npm start   (node --env-file=.env server/index.mjs)
//
// Flow:  POST /api/jobs (upload) -> background: audio, transcribe, then for each target language:
//        translate -> voice every line -> mix  (no approval step; lines can optionally be edited, then re-rendered)
//        -> GET /api/jobs/:id/langs/:lang/video
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { extractAudio, transcribe, translate, voiceLine, mix, TARGETS, SOURCES } from "../src/pipeline.mjs";
import { duration, tts, createVoiceEmbedding } from "../src/tts.mjs";
import { startBot, telegramState } from "./bot.mjs";
import { initAuth, authRouter, authenticate, requireAuth, sameOrigin, securityHeaders, canSee, INTERNAL_KEY } from "./auth.mjs";
import { execFileSync } from "node:child_process";

const PORT = process.env.PORT || 3001;
const JOBS_DIR = resolve(process.env.JOBS_DIR || "work/jobs");
// Timbre v3.0 voices (from the Gnani docs). Default: one per speaker, rotating; the user can override per speaker.
const VOICE_LIST = [
  { name: "Shivani", gender: "Female", persona: "Warm, empathetic" }, { name: "Avinash", gender: "Male", persona: "Professional" },
  { name: "Lakshmi", gender: "Female", persona: "Expressive, energetic" }, { name: "Devansh", gender: "Male", persona: "Conversational" },
  { name: "Kalpana", gender: "Female", persona: "Warm, empathetic" }, { name: "Shubham", gender: "Male", persona: "Expressive, energetic" },
  { name: "Chetana", gender: "Female", persona: "Warm, empathetic" }, { name: "Prakash", gender: "Male", persona: "Professional" },
  { name: "Vasudha", gender: "Female", persona: "Expressive, energetic" }, { name: "Yashraj", gender: "Male", persona: "Warm, empathetic" },
  { name: "Riyaa", gender: "Female", persona: "Confident, authoritative" }, { name: "Harshad", gender: "Male", persona: "Professional" },
  { name: "Tarika", gender: "Female", persona: "Warm, empathetic" },
];
const VOICE_NAMES = new Set(VOICE_LIST.map((v) => v.name));
const DEFAULT_ORDER = ["Shivani", "Avinash", "Lakshmi", "Devansh", "Riyaa", "Prakash"];
const speakersOf = (job) => [...new Set(job.segments.map((s) => s.speaker))].sort((a, b) => a - b);
const defaultVoice = (job, speaker) => DEFAULT_ORDER[Math.max(0, speakersOf(job).indexOf(speaker)) % DEFAULT_ORDER.length];
// A speaker's chosen voice: a preset name, or "clone" (match the original speaker). Falls back to the default rotation.
const voiceFor = (job, speaker) => job.voices?.[speaker] ?? defaultVoice(job, speaker);

// ---- voice cloning: needs 5-30 s of that speaker's own speech (Gnani's requirement) ----
const MIN_CLONE_SECONDS = 5, MAX_CLONE_SECONDS = 28;
const speechSeconds = (job, speaker) => job.segments.filter((s) => s.speaker === speaker).reduce((n, s) => n + (s.end - s.start), 0);
const ALLOWED_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
// Bump when the audio mix changes in a way that makes older rendered files wrong. v2 = original audio fully muted.
const MIX_VERSION = 2;

await mkdir(JOBS_DIR, { recursive: true });
await initAuth();

// ---------- job store (in memory, mirrored to work/jobs/<id>/job.json) ----------
const jobs = new Map();
for (const id of await readdir(JOBS_DIR)) {
  try {
    const j = JSON.parse(await readFile(join(JOBS_DIR, id, "job.json"), "utf8"));
    // a job that was mid-flight when the server stopped cannot continue
    if (j.status === "processing") { j.status = "failed"; j.error = "Server restarted during processing"; }
    for (const l of Object.values(j.langs)) {
      if (["translating", "rendering"].includes(l.status)) { l.status = "failed"; l.error = "Server restarted"; }
      // Dubs rendered by an older mixer (e.g. with the original audio only turned down, not muted) must not be shown as current.
      if (l.dubbed && l.mixVersion !== MIX_VERSION) { l.dubbed = false; l.status = "review"; }
    }
    jobs.set(id, j);
  } catch { /* not a job folder */ }
}
const jobDir = (id) => join(JOBS_DIR, id);
const save = (job) => writeFile(join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
const langDir = async (job, lang) => { const d = join(jobDir(job.id), TARGETS[lang].code); await mkdir(d, { recursive: true }); return d; };

/** Reference clip (this speaker's own speech from the video's audio) -> Gnani voice embedding. Cached per speaker. null = not enough speech. */
async function getEmbedding(job, speaker) {
  const cache = join(jobDir(job.id), `voice_${speaker}.json`);
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
  const picked = [];
  let total = 0;
  for (const s of job.segments.filter((x) => x.speaker === speaker && x.end - x.start >= 0.6)) {
    if (total >= MAX_CLONE_SECONDS) break;
    const d = Math.min(s.end - s.start, MAX_CLONE_SECONDS - total);
    picked.push({ start: s.start, d }); total += d;
  }
  if (total < MIN_CLONE_SECONDS) return null;
  const graph = picked.map((p, i) => `[0:a]atrim=start=${p.start.toFixed(2)}:duration=${p.d.toFixed(2)},asetpts=PTS-STARTPTS[a${i}]`).join(";")
    + `;${picked.map((_, i) => `[a${i}]`).join("")}concat=n=${picked.length}:v=0:a=1[out]`;
  const ref = join(jobDir(job.id), `ref_${speaker}.wav`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(jobDir(job.id), "audio.wav"), "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-ar", "16000", ref]);
  const emb = await createVoiceEmbedding(ref);
  await writeFile(cache, JSON.stringify(emb));
  return emb;
}

const voicesPayload = (job) => speakersOf(job).map((sp, i) => ({
  speaker: sp, label: `Speaker ${i + 1}`, voice: voiceFor(job, sp),
  speechSeconds: +speechSeconds(job, sp).toFixed(1), canClone: speechSeconds(job, sp) >= MIN_CLONE_SECONDS, consent: !!job.cloneConsent,
}));

// A job is a bag of lines per language; strip server-only file paths before sending to the browser.
const publicLine = ({ fit_file, ...rest }) => rest;
const publicJob = (j) => ({
  ...j,
  langs: Object.fromEntries(Object.entries(j.langs).map(([k, v]) => [k, { ...v, lines: v.lines.map(publicLine) }])),
});

// ---------- pipeline runners (background) ----------
async function translateLang(job, lang) {
  job.langs[lang] = { status: "translating", lines: [], dubbed: false, error: null };
  await save(job);
  try {
    job.langs[lang].lines = await translate(job.segments, lang, job.source);
    job.langs[lang].status = "review";
  } catch (e) {
    job.langs[lang].status = "failed";
    job.langs[lang].error = e.message;
  }
  await save(job);
}

async function runJob(job, targets) {
  try {
    job.stage = "audio";
    await save(job);
    const audio = extractAudio(join(jobDir(job.id), job.videoFile), jobDir(job.id));
    job.duration = +duration(audio).toFixed(2);
    job.stage = "transcribe";
    await save(job);
    job.segments = await transcribe(audio, jobDir(job.id), job.source);
    if (!job.segments.length) throw new Error("No speech found in this video.");
    if (job.voiceChoice) { // voice picked up front (e.g. from Telegram): apply it to every speaker
      job.voices = {};
      for (const sp of speakersOf(job)) if (job.voiceChoice !== "clone" || speechSeconds(job, sp) >= MIN_CLONE_SECONDS) job.voices[sp] = job.voiceChoice;
    }
    job.stage = "translate";
    await save(job);
    for (const lang of targets) { job.stage = "translate"; await dubLang(job, lang); }
    job.status = "review";
    job.stage = "ready";
  } catch (e) {
    job.status = "failed";
    job.error = e.message;
  }
  await save(job);
}

async function renderLang(job, lang) {
  const L = job.langs[lang];
  L.status = "rendering"; L.error = null; await save(job);
  try {
    const dir = await langDir(job, lang);
    L.cloneNotes = []; // speakers that asked for a cloned voice but got a preset (shown in the Studio)
    const cloned = new Map(); // speaker -> embedding | null
    for (const line of L.lines) {
      let voice = voiceFor(job, line.speaker);
      let ttsVoice = voice;
      if (voice === "clone") {
        if (!cloned.has(line.speaker)) {
          try { cloned.set(line.speaker, await getEmbedding(job, line.speaker)); }
          catch (e) { cloned.set(line.speaker, null); L.cloneNotes.push(`${e.message}`); }
          if (cloned.get(line.speaker) === null && !L.cloneNotes.length) L.cloneNotes.push(`Not enough clear speech from this speaker to copy their voice, so a studio voice was used.`);
        }
        const emb = cloned.get(line.speaker);
        if (emb) ttsVoice = { embedding: emb };
        else { voice = defaultVoice(job, line.speaker); ttsVoice = voice; }
      }
      line.voice = voice;
      // Too-long machine translations are shortened and too-short ones lengthened to fit the slot; a line the user typed is never rewritten.
      await voiceLine(line, lang, dir, ttsVoice, { autoFit: !line.edited });
    }
    mix(join(jobDir(job.id), job.videoFile), L.lines, join(dir, "dubbed.mp4"));
    L.dubbed = true;
    L.mixVersion = MIX_VERSION;
    L.status = "done";
  } catch (e) {
    L.status = "failed";
    L.error = e.message;
  }
  await save(job);
}

/** One click = translate (if not done yet) then voice + mix. Safe to call again after a failure. */
async function dubLang(job, lang) {
  if (!job.langs[lang]?.lines.length) await translateLang(job, lang);
  if (job.langs[lang].status === "failed") return; // translation failed; error is on the language
  job.stage = "voice";
  await save(job);
  await renderLang(job, lang);
}

// ---------- HTTP ----------
const app = express();
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1); // set when running behind a reverse proxy (so req.ip is the real client)
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
// Everything under /api needs a signed-in user, except the sign-in/sign-up routes themselves.
app.use("/api", sameOrigin, authenticate);
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);

const upload = multer({
  limits: { fileSize: 200 * 1024 * 1024 },
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      req.jobId = randomUUID();
      await mkdir(jobDir(req.jobId), { recursive: true });
      cb(null, jobDir(req.jobId));
    },
    filename: (req, file, cb) => cb(null, "input" + extname(file.originalname).toLowerCase()),
  }),
  fileFilter: (req, file, cb) => cb(null, ALLOWED_EXT.has(extname(file.originalname).toLowerCase())),
});

// A job you may not open is reported as "not found" (never "forbidden"), so ids can't be probed.
const getJob = (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !canSee(req.user, job)) { res.status(404).json({ error: "Job not found" }); return undefined; }
  return job;
};
const ownerOf = (req) => (req.user.role === "system" ? "telegram" : req.user.id);
const getLang = (req, res, job) => {
  const L = job.langs[req.params.lang];
  if (!L) res.status(404).json({ error: "Language not on this job" });
  return L;
};

// Upload a video. Fields: video (file), source = hi|en, targets = "kn,ta"
app.post("/api/jobs", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: `Send a video file (${[...ALLOWED_EXT].join(", ")}) in field "video".` });
  const source = req.body.source || "hi";
  const targets = (req.body.targets || "kn").split(",").map((s) => s.trim()).filter(Boolean);
  if (!SOURCES[source]) return res.status(400).json({ error: `Spoken language must be one of: ${Object.keys(SOURCES).join(", ")}` });
  if (!targets.length || targets.some((t) => !TARGETS[t])) return res.status(400).json({ error: `Dub-into languages must be from: ${Object.keys(TARGETS).join(", ")}` });
  if (targets.includes(source)) return res.status(400).json({ error: "A video can't be dubbed into the language it is already spoken in." });
  // Optional voice for every speaker: a preset name, or "clone" (match the original speakers; needs cloneConsent=true)
  const voice = (req.body.voice || "").trim();
  const consent = String(req.body.cloneConsent) === "true";
  if (voice && voice !== "default" && voice !== "clone" && !VOICE_NAMES.has(voice)) return res.status(400).json({ error: `Unknown voice ${voice}` });
  if (voice === "clone" && !consent) return res.status(400).json({ error: "Copying a voice needs your confirmation that you have permission from the speaker." });

  const job = {
    id: req.jobId, ownerId: ownerOf(req), status: "processing", stage: "audio", error: null, source,
    originalName: req.file.originalname, videoFile: req.file.filename,
    createdAt: new Date().toISOString(), duration: null, segments: [], langs: {},
    voiceChoice: voice && voice !== "default" ? voice : null, cloneConsent: voice === "clone" ? true : false,
  };
  jobs.set(job.id, job);
  await save(job);
  runJob(job, targets); // not awaited: runs in background
  res.status(202).json(publicJob(job));
});

app.get("/api/jobs", (req, res) =>
  res.json([...jobs.values()].filter((j) => canSee(req.user, j)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => ({
    id: j.id, originalName: j.originalName, title: j.title ?? null, status: j.status, stage: j.stage, createdAt: j.createdAt, source: j.source, duration: j.duration,
    langs: Object.fromEntries(Object.entries(j.langs).map(([k, v]) => [k, { status: v.status, dubbed: v.dubbed, lines: v.lines.length }])),
  }))));

app.get("/api/jobs/:id", (req, res) => { const j = getJob(req, res); if (j) res.json(publicJob(j)); });

const isBusy = (j) => j.status === "processing" || Object.values(j.langs).some((l) => ["translating", "rendering"].includes(l.status));
const fileSafe = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "_").slice(0, 80) || "dub";

// Rename (display name only; the uploaded file is untouched). Body: { title }
app.patch("/api/jobs/:id", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const title = typeof req.body.title === "string" ? req.body.title.trim().replace(/\s+/g, " ") : "";
  if (!title || title.length > 80) return res.status(400).json({ error: "Name must be 1-80 characters." });
  job.title = title;
  await save(job);
  res.json({ id: job.id, title });
});

// Delete a video and everything made from it (uploaded file, transcript, all dubs). Not allowed while it is being processed.
app.delete("/api/jobs/:id", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  if (isBusy(job)) return res.status(409).json({ error: "This video is still being processed. Try again when it finishes." });
  try {
    await rm(jobDir(job.id), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (e) {
    return res.status(500).json({ error: `Could not delete the files (is the video open or playing?): ${e.code || e.message}` });
  }
  jobs.delete(job.id);
  res.status(204).end();
});

// Dub into another language (translate + voice + mix in the background). Also retries a failed one.
app.post("/api/jobs/:id/langs/:lang", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  if (!TARGETS[req.params.lang]) return res.status(400).json({ error: "Unknown language" });
  if (req.params.lang === job.source) return res.status(400).json({ error: "That is already the spoken language of this video." });
  if (job.status !== "review") return res.status(409).json({ error: "Job is not ready yet" });
  if (job.langs[req.params.lang] && job.langs[req.params.lang].status !== "failed") return res.status(409).json({ error: "Language already added" });
  dubLang(job, req.params.lang);
  res.status(202).json({ ok: true });
});

// Edit a line's text -> marks it edited and invalidates the dub (the user re-renders afterwards)
app.patch("/api/jobs/:id/langs/:lang/lines/:lineId", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  if (L.status === "rendering" || L.status === "translating") return res.status(409).json({ error: "Busy, try again in a moment" });
  const line = L.lines.find((l) => String(l.id) === req.params.lineId);
  if (!line) return res.status(404).json({ error: "Line not found" });
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 1000) return res.status(400).json({ error: "text must be 1-1000 characters" });
  if (text !== line.text) { line.text = text; line.edited = true; line.shortened = false; L.dubbed = false; L.status = "review"; }
  await save(job);
  res.json(publicLine(line));
});

// Re-render the dub (after editing a line or changing a voice).
app.post("/api/jobs/:id/langs/:lang/render", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  if (L.status === "rendering" || L.status === "translating") return res.status(409).json({ error: "Busy" });
  if (!L.lines.length) return res.status(409).json({ error: "Nothing to render yet" });
  renderLang(job, req.params.lang); // background
  res.status(202).json({ ok: true });
});

// Files (sendFile supports Range requests, so <video> can seek)
app.get("/api/jobs/:id/video", (req, res) => { const j = getJob(req, res); if (j) res.sendFile(join(jobDir(j.id), j.videoFile)); });
app.get("/api/jobs/:id/langs/:lang/video", (req, res) => {
  const j = getJob(req, res); if (!j) return;
  const L = getLang(req, res, j); if (!L) return;
  const f = join(jobDir(j.id), TARGETS[req.params.lang].code, "dubbed.mp4");
  if (!L.dubbed || !existsSync(f)) return res.status(404).json({ error: "Not rendered yet (or edited since)" });
  if (req.query.download) return res.download(f, `${fileSafe(j.title || j.originalName.replace(/\.[^.]+$/, ""))}_${req.params.lang}.mp4`);
  res.sendFile(f);
});

// ---------- sample video: a synthetic two-speaker Hindi clip made with Timbre (no real people's voices) ----------
const SAMPLE_LINES = [
  { voice: "Shivani", text: "खाना खाने से पहले हाथ साबुन से धोएं।" },
  { voice: "Avinash", text: "कम से कम बीस सेकंड तक हाथ रगड़ें।" },
  { voice: "Shivani", text: "बच्चों को भी यही आदत सिखाएं।" },
  { voice: "Avinash", text: "ज़्यादा जानकारी के लिए आशा दीदी से मिलें।" },
];
async function makeSample(job) {
  const dir = jobDir(job.id);
  const list = [];
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.7", "-c:a", "pcm_s16le", join(dir, "gap.wav")]);
  for (let i = 0; i < SAMPLE_LINES.length; i++) {
    const f = join(dir, `s${i}.wav`);
    await writeFile(f, await tts(SAMPLE_LINES[i].text, "hi-IN", SAMPLE_LINES[i].voice));
    list.push(`file '${f.replace(/\\/g, "/")}'`, `file '${join(dir, "gap.wav").replace(/\\/g, "/")}'`);
  }
  await writeFile(join(dir, "list.txt"), list.join("\n"));
  const wav = join(dir, "sample.wav");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-c", "copy", wav]);
  // A purple gradient with a bar pattern (always visible) and a live sound-wave of the speech on top, so any frame of the
  // sample, and therefore its Library thumbnail, looks like a proper poster.
  const N = 28, GAP = 28, x0 = Math.round((1280 - N * GAP) / 2);
  const boxes = Array.from({ length: N }, (_, i) => {
    const h = Math.round(50 + 230 * Math.abs(Math.sin(i * 0.52 + 0.6)) * (0.55 + 0.45 * Math.sin(i * 0.23 + 1)));
    return `drawbox=x=${x0 + i * GAP}:y=${360 - Math.round(h / 2)}:w=14:h=${h}:color=0xFFA6E7@0.55:t=fill`;
  }).join(",");
  const graph = `[0:v]${boxes}[bg];[1:a]aformat=channel_layouts=mono,volume=3,showwaves=s=1000x360:mode=cline:rate=25:scale=sqrt:colors=0xFFFFFF@0.9[w];[bg][w]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "gradients=s=1280x720:c0=0x2B2559:c1=0x7A3A86:speed=0:r=25", "-i", wav,
    "-filter_complex", graph, "-map", "[v]", "-map", "1:a", "-t", String(duration(wav)), "-c:v", "libx264", "-c:a", "aac", join(dir, job.videoFile)]);
}

app.post("/api/samples", async (req, res) => {
  const id = randomUUID();
  await mkdir(jobDir(id), { recursive: true });
  const job = {
    id, ownerId: ownerOf(req), status: "processing", stage: "audio", error: null, source: "hi",
    originalName: "sample_handwashing_hi.mp4", videoFile: "input.mp4",
    createdAt: new Date().toISOString(), duration: null, segments: [], langs: {}, voices: {},
  };
  jobs.set(id, job);
  await save(job);
  res.status(202).json(publicJob(job));
  makeSample(job).then(() => runJob(job, ["kn"])).catch(async (e) => { job.status = "failed"; job.error = `Could not make the sample: ${e.message}`; await save(job); });
});

// ---------- voices ----------
app.get("/api/voices", (req, res) => res.json(VOICE_LIST));
app.get("/api/jobs/:id/voices", (req, res) => {
  const job = getJob(req, res); if (!job) return;
  res.json(voicesPayload(job));
});
// body: { "<speakerId>": "VoiceName" | "clone" | "default", ..., cloneConsent?: true }
// "clone" = match the original speaker. It copies a real person's voice, so it needs cloneConsent: true
// (the user confirms they have permission) and at least 5 s of that speaker's speech.
// Changing a voice invalidates any rendered dub.
app.put("/api/jobs/:id/voices", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  if (Object.values(job.langs).some((l) => l.status === "rendering")) return res.status(409).json({ error: "Busy rendering" });
  const { cloneConsent, ...map } = req.body ?? {};
  const valid = new Set(speakersOf(job).map(String));
  for (const [sp, v] of Object.entries(map)) {
    if (!valid.has(sp)) return res.status(400).json({ error: `Unknown speaker ${sp}` });
    if (v === "clone") {
      if (cloneConsent !== true && !job.cloneConsent) return res.status(400).json({ error: "Copying a voice needs your confirmation that you have permission from the speaker." });
      const secs = speechSeconds(job, Number(sp));
      if (secs < MIN_CLONE_SECONDS) return res.status(400).json({ error: `This speaker talks for only ${secs.toFixed(1)} s. Copying a voice needs at least ${MIN_CLONE_SECONDS} s.` });
    } else if (v !== "default" && !VOICE_NAMES.has(v)) return res.status(400).json({ error: `Unknown voice ${v}` });
  }
  if (cloneConsent === true) job.cloneConsent = true;
  job.voices = { ...(job.voices ?? {}) };
  for (const [sp, v] of Object.entries(map)) { if (v === "default") delete job.voices[sp]; else job.voices[sp] = v; }
  for (const l of Object.values(job.langs)) if (l.dubbed) { l.dubbed = false; l.status = "review"; }
  await save(job);
  res.json(voicesPayload(job));
});

// ---------- thumbnails (Library cards) ----------
app.get("/api/jobs/:id/thumb", (req, res) => {
  const j = getJob(req, res); if (!j) return;
  const src = join(jobDir(j.id), j.videoFile);
  const out = join(jobDir(j.id), "thumb2.jpg");
  try {
    if (!existsSync(src)) throw new Error("video file is missing");
    if (!existsSync(out)) {
      // a frame from about a third of the way in is more representative than the very first second
      const d = duration(src);
      const at = Number.isFinite(d) && d > 1.5 ? Math.min(d * 0.35, d - 0.5) : 0.2;
      execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", at.toFixed(2), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out]);
    }
    res.sendFile(out);
  } catch { res.status(404).json({ error: "No thumbnail" }); } // the Library then shows its generated cover
});

// ---------- which services are configured (booleans only, never the keys) ----------
app.get("/api/status", async (req, res) => {
  const tg = await tgState();
  res.json({
    gnani: !!process.env.GNANI_API_KEY,
    llm: !!process.env.LLM_API_KEY, llmModel: process.env.LLM_MODEL || "gemini-3.5-flash-lite",
    telegramToken: !!process.env.TELEGRAM_BOT_TOKEN, telegramOnline: !!tg.online, telegramBot: tg.botUsername ?? null,
    limits: { maxMinutes: 5, maxMB: 200 },
  });
});

// ---------- Telegram (the bot lives in server/bot.mjs and keeps its own state) ----------
const tgState = async () => telegramState();
app.get("/api/telegram", async (req, res) => res.json(await tgState()));

// Basic error handler (e.g. upload too large)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 200 MB)" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`Vaani Studio API on http://localhost:${PORT}`);
  if (process.env.TELEGRAM_BOT_TOKEN) startBot({ token: process.env.TELEGRAM_BOT_TOKEN, apiBase: `http://localhost:${PORT}`, internalKey: INTERNAL_KEY });
  else console.log("[bot] TELEGRAM_BOT_TOKEN is not set, so the Telegram bot is off.");
});
