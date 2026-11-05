// Step 4: make each spoken line fit its time slot.
//  1) If the line is too long (ratio > 1.2), ask the LLM for a shorter version and re-speak it (max 3 tries).
//  2) Then speed up/slow down with ffmpeg atempo, limited to 0.85-1.25.
// Run:  node --env-file=.env scripts/04-fit.mjs [kn|ta|te] [voice]
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tts, duration, LANG_CODES } from "../src/tts.mjs";
import { askJson } from "../src/llm.mjs";

const SCRIPTS = { "kn-IN": /[ಀ-೿]/g, "ta-IN": /[஀-௿]/g, "te-IN": /[ఀ-౿]/g };
const NAMES = { "kn-IN": "Kannada", "ta-IN": "Tamil", "te-IN": "Telugu" };
const MAX_RATIO_BEFORE_TEMPO = 1.2; // aim for this so atempo (max 1.25) has headroom
const TEMPO_MIN = 0.85, TEMPO_MAX = 1.25;

const code = LANG_CODES[process.argv[2] ?? "kn"];
const voice = process.argv[3] ?? "Shivani";
const lines = JSON.parse(await readFile(`work/translated_${code}.json`, "utf8"));

function inRightScript(text) {
  const letters = text.replace(/[\s\d\p{P}]/gu, "");
  const good = (text.match(SCRIPTS[code]) || []).length;
  return letters.length > 0 && good / letters.length > 0.8;
}

async function shorten(line, slot) {
  const targetChars = Math.floor(line.text.length * ((slot * 1.1) / line.tts_seconds));
  const system =
    `You shorten ${NAMES[code]} dubbing lines. Keep the key meaning and the native ${NAMES[code]} script, ` +
    `but make it MUCH shorter: at most ${targetChars} characters (currently ${line.text.length}). ` +
    `Drop greetings and filler before dropping facts. Reply ONLY with JSON: {"text": string}.`;
  const out = await askJson(system, JSON.stringify({ hindi_original: line.source_text, current: line.text }));
  return out.text;
}

for (const line of lines) {
  const slot = line.end - line.start;
  if (!line.tts_file) throw new Error("Run 03-speak first");

  for (let t = 1; t <= 3 && line.tts_seconds / slot > MAX_RATIO_BEFORE_TEMPO; t++) {
    console.log(`line ${line.id}: ratio ${(line.tts_seconds / slot).toFixed(2)} too long, shortening (try ${t})...`);
    const shorter = await shorten(line, slot);
    if (!shorter || !inRightScript(shorter) || shorter.length >= line.text.length) {
      console.log("  LLM gave an unusable answer, trying again");
      continue;
    }
    line.text = shorter;
    line.edited = false; // machine-shortened, still needs human approval
    await writeFile(line.tts_file, await tts(line.text, code, voice));
    line.tts_seconds = +duration(line.tts_file).toFixed(2);
    console.log(`  new text (${line.text.length} chars) -> ${line.tts_seconds}s`);
  }

  const ratio = line.tts_seconds / slot;
  const tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, ratio));
  const fitFile = `work/fit_${code}_${line.id}.wav`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", line.tts_file, "-filter:a", `atempo=${tempo.toFixed(3)}`, fitFile]);
  line.fit_file = fitFile;
  line.tempo = +tempo.toFixed(3);
  line.fit_seconds = +duration(fitFile).toFixed(2);
  const verdict = line.fit_seconds <= slot + 0.3 ? "FITS" : "STILL TOO LONG";
  console.log(`line ${line.id}: tempo ${line.tempo}, final ${line.fit_seconds}s vs slot ${slot.toFixed(2)}s -> ${verdict}`);
}

await writeFile(`work/translated_${code}.json`, JSON.stringify(lines, null, 2));
console.log("\nFinal text:");
for (const l of lines) console.log(`  [${l.id}] ${l.text}`);
