// Gnani Timbre TTS helper + audio duration helper (shared by scripts and, later, the server).
import { execFileSync } from "node:child_process";

export const LANG_CODES = { kn: "kn-IN", ta: "ta-IN", te: "te-IN", hi: "hi-IN", en: "en-IN" };

/** Returns a WAV Buffer (24 kHz mono) for `text` in language `code` (e.g. "kn-IN"). */
export async function tts(text, code, voice = "Shivani") {
  const key = process.env.GNANI_API_KEY;
  if (!key) throw new Error("GNANI_API_KEY missing in .env");
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
      await new Promise((r) => setTimeout(r, 10000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Duration of a media file in seconds (uses ffprobe). */
export function duration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(out.toString());
}
