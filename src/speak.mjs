// "Voice a message": typed text -> (translated) -> spoken audio. No video involved.
// Used by the Studio's "Voice message" page and by the Telegram bot (send text, get a voice note back).
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { translate, TARGETS } from "./pipeline.mjs";
import { tts, duration } from "./tts.mjs";

export const MAX_CHARS = 1200;   // longest message accepted
const CHUNK_CHARS = 260;         // each piece sent to the voice stays short, so it sounds natural and never hits an API limit
const CHARS_PER_SECOND = 13;     // rough speaking speed, only used to tell the translator how long a line may be

/** Split text into pieces of at most CHUNK_CHARS, breaking at sentence ends first, then commas, then spaces. */
export function splitText(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?।॥])\s+/);
  const pieces = [];
  for (const s of sentences) {
    let rest = s;
    while (rest.length > CHUNK_CHARS) {
      const window = rest.slice(0, CHUNK_CHARS);
      const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" "));
      const at = cut > CHUNK_CHARS * 0.4 ? cut + 1 : CHUNK_CHARS;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  }
  const chunks = [];
  for (const p of pieces) {
    if (chunks.length && chunks[chunks.length - 1].length + 1 + p.length <= CHUNK_CHARS) chunks[chunks.length - 1] += " " + p;
    else chunks.push(p);
  }
  return chunks;
}

/**
 * Turn a message into speech in one language.
 * from: "auto" (detect) or a language id; if it is the same as `to` (or the text is already in `to`) it is spoken as written.
 * Returns { text, wavPath, seconds, termsMissed }.
 */
export async function speakMessage({ text, to, from = "auto", voice = "Shivani", glossary = [], dir }) {
  const t = TARGETS[to];
  if (!t) throw new Error("Unknown language");
  const chunks = splitText(text);
  if (!chunks.length) throw new Error("Type a message first.");
  if (chunks.join(" ").length > MAX_CHARS) throw new Error(`Keep the message under ${MAX_CHARS} characters.`);
  await mkdir(dir, { recursive: true });

  const segments = chunks.map((c, i) => ({ id: i, start: 0, end: Math.max(1.5, c.length / CHARS_PER_SECOND), text: c, speaker: "A" }));
  const lines = from === to
    ? segments.map((x) => ({ ...x, source_text: x.text, termsMissed: [] }))
    : await translate(segments, to, from, glossary, { allowSame: true });

  const files = [];
  for (const [i, line] of lines.entries()) {
    const f = join(dir, `part_${i}.wav`);
    await writeFile(f, await tts(line.text, t.tts ?? t.code, voice));
    files.push(f);
  }
  const wavPath = join(dir, "speech.wav");
  if (files.length === 1) execFileSync("ffmpeg", ["-y", "-v", "error", "-i", files[0], wavPath]);
  else {
    const list = join(dir, "parts.txt");
    await writeFile(list, files.map((f) => `file '${resolve(f).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", wavPath]);
  }
  return {
    text: lines.map((l) => l.text).join(" "), wavPath, seconds: +duration(wavPath).toFixed(1),
    termsMissed: [...new Set(lines.flatMap((l) => l.termsMissed ?? []))],
  };
}

/** Convert the finished WAV to another format. mp3 for downloads, ogg (Opus) for Telegram voice notes. */
export function convertAudio(wavPath, format, outPath) {
  const codec = { mp3: ["-codec:a", "libmp3lame", "-q:a", "4"], ogg: ["-codec:a", "libopus", "-b:a", "32k", "-application", "voip"] }[format];
  if (!codec) throw new Error("Unknown audio format");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", wavPath, "-ar", format === "ogg" ? "48000" : "24000", ...codec, outPath]);
}
