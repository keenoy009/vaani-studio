// Step 1: transcribe a clip with Gnani Prisma batch STT (with speaker labels).
// Run:  node --env-file=.env scripts/01-transcribe.mjs [audioPath] [languageCode]
// Defaults: work/sample_hi.wav, hi-IN
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const BASE = "https://api.vachana.ai";
const key = process.env.GNANI_API_KEY;
if (!key) throw new Error("GNANI_API_KEY missing in .env");

const audioPath = process.argv[2] ?? "work/sample_hi.wav";
const languageCode = process.argv[3] ?? "hi-IN";
const headers = { "X-API-Key-ID": key };

async function api(method, path, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, { method, headers, ...opts });
    const text = await res.text();
    if (res.status === 429 && attempt < 6) {
      const wait = 10 * attempt;
      console.log(`  rate limited (429), waiting ${wait}s then retrying (${attempt}/5)...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    return json;
  }
}

// 1. Create job (multipart: config JSON + file)
const config = {
  model: "prisma-v2.5",
  language_code: languageCode,
  mode: "transcribe",
  with_diarization: true,
  is_multi_channel: false,
};
// Build multipart by hand so the `config` part has NO filename (same as curl -F 'config=...;type=application/json').
const boundary = "----vaani" + Date.now().toString(16);
const CRLF = "\r\n";
const body = Buffer.concat([
  Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="config"${CRLF}Content-Type: application/json${CRLF}${CRLF}` +
      JSON.stringify(config) + CRLF +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="files"; filename="${basename(audioPath)}"${CRLF}Content-Type: audio/wav${CRLF}${CRLF}`
  ),
  await readFile(audioPath),
  Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
]);

const created = await api("POST", "/stt/v3/batch/jobs", {
  body,
  headers: { ...headers, "Content-Type": `multipart/form-data; boundary=${boundary}` },
});
const jobId = created.job_id;
console.log("Created job:", jobId, created.status);

// 2. Start it (creating alone does not start transcription)
const started = await api("POST", `/stt/v3/batch/jobs/${jobId}/start`);
console.log("Started:", started.status);

// 3. Poll until a terminal status
const terminal = ["COMPLETED", "PARTIAL_FAILURE", "FAILED", "START_FAILED", "CANCELLED"];
let job;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  job = await api("GET", `/stt/v3/batch/jobs/${jobId}`);
  console.log(`  status: ${job.status}`);
  if (terminal.includes(job.status)) break;
}
if (!job || !terminal.includes(job.status)) throw new Error("Timed out waiting for job");
if (job.status !== "COMPLETED") {
  throw new Error(`Job ended as ${job.status}: ${job.cancel_reason ?? JSON.stringify(job.progress)}`);
}

// 4. List files -> transcript_url (pre-signed, no API key needed to download)
const files = await api("GET", `/stt/v3/batch/jobs/${jobId}/files?status=COMPLETED`);
const file = files.data?.[0];
if (!file?.transcript_url) throw new Error("No transcript_url in response: " + JSON.stringify(files));

// 5. Download transcript
const tr = await fetch(file.transcript_url, { redirect: "follow" });
if (!tr.ok) throw new Error(`Transcript download failed: ${tr.status}`);
const transcript = await tr.json();

await writeFile("work/transcript_raw.json", JSON.stringify(transcript, null, 2));
const segments = (transcript.segments ?? [])
  .filter((s) => s.text && s.text.trim())
  .map((s) => ({
    id: s.segment_id,
    start: s.start_time,
    end: s.end_time,
    speaker: s.speaker_id,
    text: s.text.trim(),
  }));
await writeFile("work/segments.json", JSON.stringify(segments, null, 2));

console.log(`\nSaved work/segments.json (${segments.length} segments):`);
for (const s of segments) {
  console.log(`[${s.start.toFixed(2)}-${s.end.toFixed(2)}] speaker ${s.speaker}: ${s.text}`);
}
