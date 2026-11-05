// Vaani Studio backend.
// Run:  npm start   (node --env-file=.env server/index.mjs)
//
// Flow:  POST /api/jobs (upload) -> background: audio, transcribe, translate
//        -> human edits/approves lines -> POST /api/jobs/:id/langs/:lang/render (needs ALL lines approved)
//        -> GET /api/jobs/:id/langs/:lang/video
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { extractAudio, transcribe, translate, voiceLine, suggestShorter, mix, TARGETS, SOURCES } from "../src/pipeline.mjs";
import { duration } from "../src/tts.mjs";

const PORT = process.env.PORT || 3001;
const JOBS_DIR = resolve("work/jobs");
const VOICES = ["Shivani", "Avinash", "Lakshmi", "Devansh", "Riyaa", "Prakash"]; // one per speaker, rotating
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
  langs: Object.fromEntries(Object.entries(j.langs).map(([k, v]) => [k, { ...v, lines: v.lines.map(publicLine), allApproved: v.lines.length > 0 && v.lines.every((l) => l.approved) }])),
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
    for (const lang of targets) await translateLang(job, lang);
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
    const speakers = [...new Set(L.lines.map((l) => l.speaker))];
    for (const line of L.lines) {
      line.voice = VOICES[speakers.indexOf(line.speaker) % VOICES.length];
      // never rewrite human-approved text: autoShorten off
      await voiceLine(line, lang, dir, line.voice, { autoShorten: false });
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
  res.json([...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => ({ id: j.id, originalName: j.originalName, status: j.status, stage: j.stage, createdAt: j.createdAt }))));

app.get("/api/jobs/:id", (req, res) => { const j = getJob(req, res); if (j) res.json(publicJob(j)); });

// Add another target language to an existing job (translates in the background)
app.post("/api/jobs/:id/langs/:lang", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  if (!TARGETS[req.params.lang]) return res.status(400).json({ error: "Unknown language" });
  if (job.status !== "review") return res.status(409).json({ error: "Job is not ready yet" });
  if (job.langs[req.params.lang] && job.langs[req.params.lang].status !== "failed") return res.status(409).json({ error: "Language already added" });
  translateLang(job, req.params.lang);
  res.status(202).json({ ok: true });
});

// Edit a line's text -> marks edited, clears approval, invalidates the dub
app.patch("/api/jobs/:id/langs/:lang/lines/:lineId", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  if (L.status === "rendering" || L.status === "translating") return res.status(409).json({ error: "Busy, try again in a moment" });
  const line = L.lines.find((l) => String(l.id) === req.params.lineId);
  if (!line) return res.status(404).json({ error: "Line not found" });
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 1000) return res.status(400).json({ error: "text must be 1-1000 characters" });
  if (text !== line.text) { line.text = text; line.edited = true; line.approved = false; line.shortened = false; L.dubbed = false; L.status = "review"; }
  await save(job);
  res.json(publicLine(line));
});

// Approve / un-approve one line: { approved: true|false }
app.post("/api/jobs/:id/langs/:lang/lines/:lineId/approve", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  if (L.status === "rendering" || L.status === "translating") return res.status(409).json({ error: "Busy, try again in a moment" });
  const line = L.lines.find((l) => String(l.id) === req.params.lineId);
  if (!line) return res.status(404).json({ error: "Line not found" });
  line.approved = req.body.approved !== false;
  await save(job);
  res.json(publicLine(line));
});

// Timing check for ONE line: speaks it and reports ratio; suggests a shorter text if too long (not applied).
app.post("/api/jobs/:id/langs/:lang/lines/:lineId/check", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  const line = L.lines.find((l) => String(l.id) === req.params.lineId);
  if (!line) return res.status(404).json({ error: "Line not found" });
  try {
    const dir = await langDir(job, req.params.lang);
    const probe = { ...line, id: `check_${line.id}` };
    await voiceLine(probe, req.params.lang, dir, line.voice || VOICES[0], { autoShorten: false });
    const slot = line.end - line.start;
    const ratio = +(probe.tts_seconds / slot).toFixed(2);
    const out = { slot: +slot.toFixed(2), spoken: probe.tts_seconds, ratio, fits: ratio <= 1.25 };
    if (!out.fits) out.suggestion = await suggestShorter(line, req.params.lang);
    res.json(out);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Render the dub. Locked until EVERY line is approved.
app.post("/api/jobs/:id/langs/:lang/render", async (req, res) => {
  const job = getJob(req, res); if (!job) return;
  const L = getLang(req, res, job); if (!L) return;
  if (L.status === "rendering" || L.status === "translating") return res.status(409).json({ error: "Busy" });
  const pending = L.lines.filter((l) => !l.approved).length;
  if (pending) return res.status(409).json({ error: `${pending} line(s) still need approval`, pending });
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
  if (req.query.download) return res.download(f, `dubbed_${req.params.lang}_${j.originalName.replace(/\.[^.]+$/, "")}.mp4`);
  res.sendFile(f);
});

// Basic error handler (e.g. upload too large)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 200 MB)" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => console.log(`Vaani Studio API on http://localhost:${PORT}`));
