// Step 3: speak each translated line with Gnani Timbre TTS.
// Run:  node --env-file=.env scripts/03-speak.mjs [kn|ta|te] [voice]
import { readFile, writeFile } from "node:fs/promises";
import { tts, duration, LANG_CODES } from "../src/tts.mjs";

const code = LANG_CODES[process.argv[2] ?? "kn"];
if (!code) throw new Error("Unknown language");
const voice = process.argv[3] ?? "Shivani";

const lines = JSON.parse(await readFile(`work/translated_${code}.json`, "utf8"));
for (const line of lines) {
  const file = `work/tts_${code}_${line.id}.wav`;
  await writeFile(file, await tts(line.text, code, voice));
  line.tts_file = file;
  line.tts_seconds = +duration(file).toFixed(2);
  const slot = line.end - line.start;
  console.log(`line ${line.id}: slot ${slot.toFixed(2)}s, spoken ${line.tts_seconds}s, ratio ${(line.tts_seconds / slot).toFixed(2)}  -> ${file}`);
}
await writeFile(`work/translated_${code}.json`, JSON.stringify(lines, null, 2));
