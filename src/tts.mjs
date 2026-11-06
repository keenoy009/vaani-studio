// Gnani Timbre TTS helper (preset voices AND cloned voices) + audio duration helper.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

export const LANG_CODES = { kn: "kn-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN", hi: "hi-IN", en: "en-IN" };

const AUDIO = { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" };
const apiKey = () => {
  const key = process.env.GNANI_API_KEY;
  if (!key) throw new Error("GNANI_API_KEY missing in .env");
  return key;
};

async function postTts(body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: { "Content-Type": "application/json", "X-API-Key-ID": apiKey() },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 6) { await new Promise((r) => setTimeout(r, 10000 * attempt)); continue; }
    if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/**
 * Returns a WAV Buffer (24 kHz mono) for `text`.
 *  - voice = "Shivani" etc.        -> a ready-made Timbre voice, `code` (e.g. "kn-IN") sets the language
 *  - voice = { embedding: {...} }  -> a CLONED voice (vachana-vc-v1). The API has no language field for these;
 *                                     it speaks the language of the text (tested: Hindi, Kannada, Tamil, English).
 */
export async function tts(text, code, voice = "Shivani") {
  if (voice && typeof voice === "object") {
    return postTts({ text, model: "vachana-vc-v1", speaker_embedding: voice.embedding, audio_config: AUDIO });
  }
  return postTts({ text, model: "timbre-v3.0", voice, language: code, speed: 1.0, audio_config: AUDIO });
}

/** Turn 5-30 s of one person's clean speech into a reusable voice embedding. Throws on API errors. */
export async function createVoiceEmbedding(wavPath) {
  const fd = new FormData();
  fd.append("audio_file", new Blob([await readFile(wavPath)], { type: "audio/wav" }), "reference.wav");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/voice-clone/embeddings", {
      method: "POST", headers: { "X-API-Key-ID": apiKey() }, body: fd, signal: AbortSignal.timeout(90000),
    });
    if (res.status === 429 && attempt < 6) { await new Promise((r) => setTimeout(r, 10000 * attempt)); continue; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.data?.voice_clone_embedding) throw new Error(`Voice cloning failed (${res.status}): ${(j.message || "").slice(0, 200)}`);
    return j.data.voice_clone_embedding;
  }
}

/** Duration of a media file in seconds (uses ffprobe). */
export function duration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(out.toString());
}
