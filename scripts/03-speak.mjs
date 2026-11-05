// Step 3: speak each translated line with Gnani Timbre TTS.
// Run:  node --env-file=.env scripts/03-speak.mjs [kn|ta|te] [voice]
// Writes work/tts_<code>_<id>.wav per line and prints how long each is vs its time slot.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const CODES = { kn: "kn-IN", ta: "ta-IN", te: "te-IN" };
const code = CODES[process.argv[2] ?? "kn"];
if (!code) throw new Error("Language must be one of: " + Object.keys(CODES).join(", "));
const voice = process.argv[3] ?? "Shivani";

const key = process.env.GNANI_API_KEY;
if (!key) throw new Error("GNANI_API_KEY missing in .env");

const lines = JSON.parse(await readFile(`work/translated_${code}.json`, "utf8"));

async function tts(text) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": key },
      body: JSON.stringify({
        text,
        model: "timbre-v3.0",
        voice,
        language: code,
        speed: 1.0,
        audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
      }),
    });
    if (res.status === 429 && attempt < 6) {
      console.log(`  rate limited, waiting ${10 * attempt}s...`);
      await new Promise((r) => setTimeout(r, 10000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

function duration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(out.toString());
}

for (const line of lines) {
  const file = `work/tts_${code}_${line.id}.wav`;
  await writeFile(file, await tts(line.text));
  line.tts_file = file;
  line.tts_seconds = +duration(file).toFixed(2);
  const slot = line.end - line.start;
  console.log(`line ${line.id}: slot ${slot.toFixed(2)}s, spoken ${line.tts_seconds}s, ratio ${(line.tts_seconds / slot).toFixed(2)}  -> ${file}`);
}

await writeFile(`work/translated_${code}.json`, JSON.stringify(lines, null, 2));
