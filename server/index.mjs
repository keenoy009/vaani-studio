// Vaani Studio backend.
// Run:  npm start   (node --env-file=.env server/index.mjs)
//
// Flow:  POST /api/jobs (upload) -> background: audio, transcribe, then for each target language:
//        translate -> voice every line -> mix  (no approval step; lines can optionally be edited, then re-rendered)
//        -> GET /api/jobs/:id/langs/:lang/video
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { extractAudio, transcribe, translate, voiceLine, mix, TARGETS, SOURCES } from "../src/pipeline.mjs";
import { duration, tts } from "../src/tts.mjs";
import { execFileSync } from "node:child_process";

const PORT = process.env.PORT || 3001;
const JOBS_DIR = resolve("work/jobs");
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
const voiceFor = (job, speaker) => job.voices?.[speaker] ?? DEFAULT_ORDER[Math.max(0, speakersOf(job).indexOf(speaker)) % DEFAULT_ORDER.length];
const ALLOWED_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);

await mkdir(JOBS_DIR, { recursive: true });

// ---------- job store (in memory, mirrored to work/jobs/<id>/job.json) ----------
const jobs = new Map();
for (const id of await readdir(JOBS_DIR)) {
  try {
    const j = JSON.parse(await readFile(join(JOBS_DIR, id, "job.json"), "utf8"));
    // a job that was mid-flight when the server stopped cannot continue
    if (j.status === "processing") { j.status = "failed"; j.error = "Server restarted during processing"; }
    for (const l of Object.values(j.langs)) if (["translating", "rendering"].includes(l.status)) { l.status = "failed"; l.error = "Server restarted"; }
    jobs.set(id, j);
  } catch { /* not a job folder */ }
}
const jobDir = (id) => join(JOBS_DIR, id);
const save = (job) => writeFile(join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
const langDir = async (job, lang) => { const d = join(jobDir(job.id), TARGETS[lang].code); await mkdir(d, { recursive: true }); return d; };

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
    for (const line of L.lines) {
      line.voice = voiceFor(job, line.speaker);
      // Too-long machine translations are shortened to fit; a line the user typed themselves is never rewritten.
      await voiceLine(line, lang, dir, line.voice, { autoShorten: !line.edited });
    }
    mix(join(jobDir(job.id), job.videoFile), L.lines, join(dir, "dubbed.mp4"));
    L.dubbed = true;
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
app.use(express.json({ limit: "1mb" }));

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

const getJob = (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) res.status(404).json({ error: "Job not found" });
  return job;
};
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
  if (!SOURCES[source]) return res.status(400).json({ error: "source must be hi or en" });
  if (!targets.length || targets.some((t) => !TARGETS[t])) return res.status(400).json({ error: `targets must be from: ${Object.keys(TARGETS).join(", ")}` });

  const job = {
    id: req.jobId, status: "processing", stage: "audio", error: null, source,
    originalName: req.file.originalname, videoFile: req.file.filename,
    createdAt: new Date().toISOString(), duration: null, segments: [], langs: {},
  };
  jobs.set(job.id, job);
  await save(job);
  runJob(job, targets); // not awaited: runs in background
  res.status(202).json(publicJob(job));
});

app.get("/api/jobs", (req, res) =>
  res.json([...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => ({
    id: j.id, originalName: j.originalName, status: j.status, stage: j.stage, createdAt: j.createdAt, source: j.source, duration: j.duration,
    langs: Object.fromEntries(Object.entries(j.langs).map(([k, v]) => [k, { status: v.status, dubbed: v.dubbed, lines: v.lines.length }])),
  }))));

app.get("/api/jobs/:id", (req, res) => { const j = getJob(req, res); if (j) res.json(publicJob(j)); });

// Dub into another language (translate + voice + mix in the background). Also retries a failed one.
app.post("/api/jobs/:id/langs/:lang", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  if (!TARGETS[req.params.lang]) return res.status(400).json({ error: "Unknown language" });
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
  if (req.query.clip) { // "Export Ns clip": first N seconds, stream-copied (no re-encode)
    const secs = Math.min(600, Math.max(1, Number(req.query.clip) || 60));
    const out = join(jobDir(j.id), TARGETS[req.params.lang].code, `clip_${secs}.mp4`);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", f, "-t", String(secs), "-c", "copy", out]);
    return res.download(out, `clip${secs}s_${req.params.lang}_${j.originalName.replace(/\.[^.]+$/, "")}.mp4`);
  }
  if (req.query.download) return res.download(f, `dubbed_${req.params.lang}_${j.originalName.replace(/\.[^.]+$/, "")}.mp4`);
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
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x12142A:s=1280x720:r=25", "-i", wav, "-t", String(duration(wav)),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(dir, job.videoFile)]);
}

app.post("/api/samples", async (req, res) => {
  const id = randomUUID();
  await mkdir(jobDir(id), { recursive: true });
  const job = {
    id, status: "processing", stage: "audio", error: null, source: "hi",
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
  res.json(speakersOf(job).map((sp, i) => ({ speaker: sp, label: `Speaker ${i + 1}`, voice: voiceFor(job, sp) })));
});
// body: { "<speakerId>": "VoiceName", ... }. Changing a voice invalidates any rendered dub.
app.put("/api/jobs/:id/voices", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  if (Object.values(job.langs).some((l) => l.status === "rendering")) return res.status(409).json({ error: "Busy rendering" });
  const valid = new Set(speakersOf(job).map(String));
  for (const [sp, v] of Object.entries(req.body ?? {})) {
    if (!valid.has(sp)) return res.status(400).json({ error: `Unknown speaker ${sp}` });
    if (!VOICE_NAMES.has(v)) return res.status(400).json({ error: `Unknown voice ${v}` });
  }
  job.voices = { ...(job.voices ?? {}), ...req.body };
  for (const l of Object.values(job.langs)) if (l.dubbed) { l.dubbed = false; l.status = "review"; }
  await save(job);
  res.json(speakersOf(job).map((sp, i) => ({ speaker: sp, label: `Speaker ${i + 1}`, voice: voiceFor(job, sp) })));
});

// ---------- Telegram (status is read from work/telegram.json, which the bot will write) ----------
const TG_FILE = resolve("work/telegram.json");
async function tgState() {
  try { return JSON.parse(await readFile(TG_FILE, "utf8")); } catch { return { online: false, groups: [], viewers: [] }; }
}
app.get("/api/telegram", async (req, res) => res.json(await tgState()));

// Send a finished dub to a Telegram group. Only a rendered, up-to-date dub can be sent (enforced here, not only in the UI).
app.post("/api/jobs/:id/langs/:lang/send", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  if (!L.dubbed) return res.status(409).json({ error: "The dub is not ready yet" });
  const tg = await tgState();
  if (!tg.online) return res.status(501).json({ error: "The Telegram bot is not set up yet." });
  res.status(501).json({ error: "Sending is not implemented yet." });
});

// Basic error handler (e.g. upload too large)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 200 MB)" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => console.log(`Vaani Studio API on http://localhost:${PORT}`));
