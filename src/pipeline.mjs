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
  ml: { name: "Malayalam", code: "ml-IN", script: /[ഀ-ൿ]/g, example: "നമസ്കാരം കൂട്ടുകാരേ" },
  bn: { name: "Bengali", code: "bn-IN", script: /[ঀ-৿]/g, example: "নমস্কার বন্ধুরা" },
  gu: { name: "Gujarati", code: "gu-IN", script: /[઀-૿]/g, example: "નમસ્તે મિત્રો" },
  pa: { name: "Punjabi", code: "pa-IN", script: /[਀-੿]/g, example: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦੋਸਤੋ" },
  hi: { name: "Hindi", code: "hi-IN", script: /[ऀ-ॿ]/g, example: "नमस्ते दोस्तों" },
  en: { name: "English", code: "en-IN", script: /[A-Za-z]/g, latin: true, example: "Hello friends" },
  // Marathi shares the Devanagari script with Hindi, so the script check alone cannot tell them apart;
  // translate() also rejects any line that comes back identical to the Hindi source.
  mr: { name: "Marathi", code: "mr-IN", script: /[ऀ-ॿ]/g, example: "नमस्कार मित्रांनो" },
  // EXPERIMENTAL. Gnani has no Konkani voice, so the text is Goan Konkani (Devanagari, written by the LLM) and the
  // audio comes from the Marathi voice model (`tts`), which reads it clearly but with a Marathi accent.
  gom: { name: "Konkani", code: "gom-IN", tts: "mr-IN", experimental: true, script: /[ऀ-ॿ]/g, example: "नमस्कार इश्टांनो",
    note: "Write Goan Konkani (Devanagari, as spoken in Goa), using real Konkani words and grammar, NOT Marathi or Hindi. " },
};
// Spoken languages we can transcribe. Gujarati and Punjabi are left out: the project brief notes that Gnani's batch STT does not handle them.
export const SOURCES = {
  hi: { name: "Hindi", code: "hi-IN" }, en: { name: "English", code: "en-IN" }, kn: { name: "Kannada", code: "kn-IN" },
  ta: { name: "Tamil", code: "ta-IN" }, te: { name: "Telugu", code: "te-IN" }, ml: { name: "Malayalam", code: "ml-IN" },
  mr: { name: "Marathi", code: "mr-IN" }, bn: { name: "Bengali", code: "bn-IN" },
};

// A dubbed line should take about as long as the original speaker did, so there is no dead air.
//  - speech much LONGER than the slot  (> 1.2x): the LLM shortens the line
//  - speech much SHORTER than the slot (< 0.85x): the LLM lengthens the line (same meaning, fuller phrasing)
//  - then ffmpeg atempo closes the rest of the gap, within 0.75-1.25x
const MAX_RATIO_BEFORE_TEMPO = 1.2;
const MIN_RATIO_BEFORE_TEMPO = 0.85;
const TEMPO_MIN = 0.75, TEMPO_MAX = 1.25;

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
  if (target.latin) return /[A-Za-z]/.test(text) && nonLatin.length === 0; // English: Latin letters only
  return nonLatin.length > 0 && nonLatin.every((c) => inScript.test(c)); // at least one target letter, none from other scripts
}

/** LLM translate. Returns lines [{...segment, source_text, text, lang, edited}]. */
export async function translate(segments, targetKey, sourceKey = "hi") {
  const t = TARGETS[targetKey], s = SOURCES[sourceKey];
  const system =
    `You are a professional dubbing translator. Translate ${s.name} speech into natural, spoken ${t.name} for a voice-over. ` +
    (t.note ?? "") +
    `The output MUST be written in the native ${t.name} script (for example "${t.example}"), NOT Bengali, Devanagari, or Latin letters` +
    (t.note ? " (Devanagari is correct for Konkani)" : "") + `. ` +
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

/** Ask the LLM for a slightly fuller version of a line, so the dub fills the time the original speaker took. */
async function lengthen(line, slot, target) {
  const wanted = Math.min(Math.floor(line.text.length * ((slot * 0.97) / line.tts_seconds)), Math.floor(line.text.length * 2.2));
  const system =
    `You make ${target.name} dubbing lines a little longer so they fill the time the original speaker took. Keep exactly the same meaning and facts, ` +
    `in the native ${target.name} script. Do NOT add new information, examples or opinions: only use fuller, natural spoken phrasing ` +
    `(for example polite connectors, complete forms, or stating the same idea more completely). Aim for about ${wanted} characters ` +
    `(currently ${line.text.length}). Reply ONLY with JSON: {"text": string}.`;
  return (await askJson(system, JSON.stringify({ original: line.source_text, current: line.text }))).text;
}

/**
 * Speak one line and time-fit it to its slot. Mutates and returns the line.
 * autoFit: let the LLM shorten a too-long line or lengthen a too-short one (never used for lines the user typed).
 */
export async function voiceLine(line, targetKey, dir, voice = "Shivani", { autoFit = true } = {}) {
  const t = TARGETS[targetKey];
  const slot = line.end - line.start;
  const raw = join(dir, `tts_${line.id}.wav`);
  await writeFile(raw, await tts(line.text, t.tts ?? t.code, voice));
  line.tts_seconds = +duration(raw).toFixed(2);

  for (let tries = 1; autoFit && tries <= 3 && line.tts_seconds / slot > MAX_RATIO_BEFORE_TEMPO; tries++) {
    let shorter;
    try { shorter = await shorten({ ...line, tts_file: raw }, slot, t); }
    catch { break; } // shortening is a nice-to-have: if the LLM is down, keep the line and just speed it up
    if (!shorter || !inRightScript(shorter, t) || shorter.length >= line.text.length) continue;
    line.text = shorter;
    line.shortened = true; line.lengthened = false; // machine-shortened to fit the time slot (the UI shows a tag)
    await writeFile(raw, await tts(line.text, t.tts ?? t.code, voice));
    line.tts_seconds = +duration(raw).toFixed(2);
  }
  // Too SHORT (the dub would leave dead air at the end of the slot): try a fuller wording, keep it only if it fits better.
  for (let tries = 1; autoFit && tries <= 2 && line.tts_seconds / slot < MIN_RATIO_BEFORE_TEMPO; tries++) {
    let longer;
    try { longer = await lengthen(line, slot, t); }
    catch (e) { if (/busy right now/.test(e.message)) break; continue; } // nice-to-have: give up if the AI is overloaded, otherwise try again
    // (the real limit is how long the speech turns out to be, checked below; 3x is only a sanity guard)
    if (!longer || !inRightScript(longer, t) || longer.length <= line.text.length || longer.length > line.text.length * 3) continue;
    const buf = await tts(longer, t.tts ?? t.code, voice);
    const probe = join(dir, `tts_${line.id}_try.wav`);
    await writeFile(probe, buf);
    const secs = +duration(probe).toFixed(2);
    if (secs <= line.tts_seconds || secs / slot > 1.1) continue; // no better, or it overshoots the slot
    line.text = longer;
    line.lengthened = true; line.shortened = false;
    await writeFile(raw, buf);
    line.tts_seconds = secs;
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
