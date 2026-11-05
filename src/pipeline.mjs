// The whole dubbing pipeline as functions. Every function takes a job directory `dir`
// so many jobs can run without touching each other's files.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { askJson } from "./llm.mjs";
import { tts, duration } from "./tts.mjs";

const BASE = "https://api.vachana.ai";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TARGETS = {
  kn: { name: "Kannada", code: "kn-IN", script: /[ಀ-೿]/g, example: "ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ" },
  ta: { name: "Tamil", code: "ta-IN", script: /[஀-௿]/g, example: "வணக்கம் நண்பர்களே" },
  te: { name: "Telugu", code: "te-IN", script: /[ఀ-౿]/g, example: "నమస్కారం మిత్రులారా" },
  // Marathi shares the Devanagari script with Hindi, so the script check alone cannot tell them apart;
  // translate() also rejects any line that comes back identical to the Hindi source.
  mr: { name: "Marathi", code: "mr-IN", script: /[ऀ-ॿ]/g, example: "नमस्कार मित्रांनो" },
};
export const SOURCES = { hi: { name: "Hindi", code: "hi-IN" }, en: { name: "English", code: "en-IN" } };

const MAX_RATIO_BEFORE_TEMPO = 1.2;
const TEMPO_MIN = 0.85, TEMPO_MAX = 1.25;

export async function makeJobDir(dir) { await mkdir(dir, { recursive: true }); return dir; }

/** ffmpeg: extract mono 16 kHz WAV. (Gnani direct upload limit is 10 MB ≈ 5 min at this format.) */
export function extractAudio(video, dir) {
  const out = join(dir, "audio.wav");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", out]);
  if (duration(out) > 290) throw new Error("Clip is longer than ~5 minutes; direct upload limit is 10 MB.");
  return out;
}

async function gnani(method, path, opts = {}) {
  const key = process.env.GNANI_API_KEY;
  if (!key) throw new Error("GNANI_API_KEY missing in .env");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, { method, signal: AbortSignal.timeout(60000), ...opts, headers: { "X-API-Key-ID": key, ...(opts.headers ?? {}) } });
    const text = await res.text();
    if (res.status === 429 && attempt < 6) { await sleep(10000 * attempt); continue; }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }
}

/** Prisma batch STT with diarization. Returns [{id,start,end,speaker,text}]. */
export async function transcribe(audioPath, dir, sourceKey = "hi") {
  const config = { model: "prisma-v2.5", language_code: SOURCES[sourceKey].code, mode: "transcribe", with_diarization: true, is_multi_channel: false };
  // Hand-built multipart: the `config` part must have no filename (Node's FormData adds one and the API then 500s).
  const b = "----vaani" + Date.now().toString(16), CRLF = "\r\n";
  const body = Buffer.concat([
    Buffer.from(`--${b}${CRLF}Content-Disposition: form-data; name="config"${CRLF}Content-Type: application/json${CRLF}${CRLF}${JSON.stringify(config)}${CRLF}` +
      `--${b}${CRLF}Content-Disposition: form-data; name="files"; filename="${basename(audioPath)}"${CRLF}Content-Type: audio/wav${CRLF}${CRLF}`),
    await readFile(audioPath),
    Buffer.from(`${CRLF}--${b}--${CRLF}`),
  ]);
  const { job_id } = await gnani("POST", "/stt/v3/batch/jobs", { body, headers: { "Content-Type": `multipart/form-data; boundary=${b}` } });
  await gnani("POST", `/stt/v3/batch/jobs/${job_id}/start`);

  const terminal = ["COMPLETED", "PARTIAL_FAILURE", "FAILED", "START_FAILED", "CANCELLED"];
  let job;
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    job = await gnani("GET", `/stt/v3/batch/jobs/${job_id}`);
    if (terminal.includes(job.status)) break;
  }
  if (job?.status !== "COMPLETED") throw new Error(`STT job ended as ${job?.status}: ${job?.cancel_reason ?? JSON.stringify(job?.progress)}`);

  const files = await gnani("GET", `/stt/v3/batch/jobs/${job_id}/files?status=COMPLETED`);
  const url = files.data?.[0]?.transcript_url;
  if (!url) throw new Error("No transcript_url: " + JSON.stringify(files));
  const tr = await fetch(url, { redirect: "follow" });
  if (!tr.ok) throw new Error(`Transcript download failed: ${tr.status}`);
  const transcript = await tr.json();
  await writeFile(join(dir, "transcript_raw.json"), JSON.stringify(transcript, null, 2));

  const segments = (transcript.segments ?? [])
    .filter((s) => s.text && s.text.trim())
    .map((s, i) => ({ id: i, start: s.start_time, end: s.end_time, speaker: s.speaker_id, text: s.text.trim() }));
  await writeFile(join(dir, "segments.json"), JSON.stringify(segments, null, 2));
  return segments;
}

// Accept only text written in the target script (plus plain Latin letters for names/brands and digits/punctuation).
// ANY other letter (e.g. a stray Korean or Bengali character the LLM slipped in) rejects the line.
function inRightScript(text, target) {
  const inScript = new RegExp(target.script.source);
  const nonLatin = [...text].filter((c) => /\p{L}|\p{M}/u.test(c) && !/[A-Za-z]/.test(c));
  return nonLatin.length > 0 && nonLatin.every((c) => inScript.test(c)); // at least one target letter, none from other scripts
}

/** LLM translate. Returns lines [{...segment, source_text, text, lang, edited}]. */
export async function translate(segments, targetKey, sourceKey = "hi") {
  const t = TARGETS[targetKey], s = SOURCES[sourceKey];
  const system =
    `You are a professional dubbing translator. Translate ${s.name} speech into natural, spoken ${t.name} for a voice-over. ` +
    `The output MUST be written in the native ${t.name} script (for example "${t.example}"), NOT Bengali, Devanagari, or Latin letters. ` +
    `Rules: keep the meaning; use simple everyday words suitable for health workers, farmers and students; keep each line about as long ` +
    `as the original when spoken, because it must fit the same time slot; write numbers as spoken words; do not add explanations. ` +
    `Reply ONLY with JSON: an array of objects {"id": number, "text": string}, one per input line, same ids.`;
  const user = JSON.stringify(segments.map((x) => ({ id: x.id, seconds: +(x.end - x.start).toFixed(2), source: x.text })));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await askJson(system, user);
    const byId = new Map(result.map((r) => [r.id, r.text]));
    const same = (x) => (byId.get(x.id) ?? "").trim() === x.text.trim(); // untranslated copy of the source
    if (segments.every((x) => inRightScript(byId.get(x.id) ?? "", t) && !same(x))) {
      return segments.map((x) => ({ ...x, source_text: x.text, text: byId.get(x.id), lang: t.code, edited: false }));
    }
  }
  throw new Error(`LLM kept returning the wrong script for ${t.name}`);
}

async function shorten(line, slot, target) {
  const targetChars = Math.floor(line.text.length * ((slot * 1.1) / line.tts_seconds));
  const system =
    `You shorten ${target.name} dubbing lines. Keep the key meaning and the native ${target.name} script, but make it MUCH shorter: ` +
    `at most ${targetChars} characters (currently ${line.text.length}). Drop greetings and filler before dropping facts. Reply ONLY with JSON: {"text": string}.`;
  return (await askJson(system, JSON.stringify({ original: line.source_text, current: line.text }))).text;
}

/** Speak one line and time-fit it. Mutates and returns the line. onlyIfNeeded skips TTS if audio is current. */
export async function voiceLine(line, targetKey, dir, voice = "Shivani", { autoShorten = true } = {}) {
  const t = TARGETS[targetKey];
  const slot = line.end - line.start;
  const raw = join(dir, `tts_${line.id}.wav`);
  await writeFile(raw, await tts(line.text, t.code, voice));
  line.tts_seconds = +duration(raw).toFixed(2);

  for (let tries = 1; autoShorten && tries <= 3 && line.tts_seconds / slot > MAX_RATIO_BEFORE_TEMPO; tries++) {
    let shorter;
    try { shorter = await shorten({ ...line, tts_file: raw }, slot, t); }
    catch { break; } // shortening is a nice-to-have: if the LLM is down, keep the line and just speed it up
    if (!shorter || !inRightScript(shorter, t) || shorter.length >= line.text.length) continue;
    line.text = shorter;
    line.shortened = true; // machine-shortened to fit the time slot (the UI shows a tag)
    await writeFile(raw, await tts(line.text, t.code, voice));
    line.tts_seconds = +duration(raw).toFixed(2);
  }
  const tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, line.tts_seconds / slot));
  const fit = join(dir, `fit_${line.id}.wav`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", raw, "-filter:a", `atempo=${tempo.toFixed(3)}`, fit]);
  line.fit_file = fit;
  line.tempo = +tempo.toFixed(3);
  line.fit_seconds = +duration(fit).toFixed(2);
  line.fits = line.fit_seconds <= slot + 0.3;
  return line;
}

/**
 * Place each dub line at its start time and copy the video stream untouched.
 * The ORIGINAL audio is dropped entirely (volume 0): only the dubbed voices are heard.
 * Audio is padded with silence and cut at the video's end (-shortest), so lengths always match.
 */
export function mix(video, lines, outPath) {
  const args = ["-y", "-v", "error", "-i", video];
  lines.forEach((l) => args.push("-i", l.fit_file));
  const parts = lines.map((l, i) => { const ms = Math.round(l.start * 1000); return `[${i + 1}:a]adelay=${ms}|${ms}[d${i}]`; });
  const labels = lines.map((_, i) => `[d${i}]`).join("");
  // amix needs 2+ inputs; with a single line just pad it.
  parts.push(lines.length > 1 ? `${labels}amix=inputs=${lines.length}:normalize=0:duration=longest,apad[mix]` : `${labels}apad[mix]`);
  args.push("-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", outPath);
  execFileSync("ffmpeg", args);
  return outPath;
}

/** Whole pipeline with no human step (CLI use). `onStage` reports progress. */
export async function runAll({ video, targetKey, sourceKey = "hi", dir, voice, onStage = () => {} }) {
  await makeJobDir(dir);
  onStage("audio"); const audio = extractAudio(video, dir);
  onStage("transcribe"); const segments = await transcribe(audio, dir, sourceKey);
  if (!segments.length) throw new Error("No speech found in the video.");
  onStage("translate"); const lines = await translate(segments, targetKey, sourceKey);
  onStage("voice"); for (const l of lines) await voiceLine(l, targetKey, dir, voice);
  await writeFile(join(dir, `lines_${TARGETS[targetKey].code}.json`), JSON.stringify(lines, null, 2));
  onStage("mix"); const out = mix(video, lines, join(dir, `dubbed_${TARGETS[targetKey].code}.mp4`));
  return { out, lines };
}
