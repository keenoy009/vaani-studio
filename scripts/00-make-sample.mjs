// Step 0: make a synthetic Hindi test clip using Gnani Timbre TTS.
// Run:  node --env-file=.env scripts/00-make-sample.mjs
import { mkdir, writeFile } from "node:fs/promises";

const key = process.env.GNANI_API_KEY;
if (!key) throw new Error("GNANI_API_KEY missing in .env");

const text =
  "नमस्ते दोस्तों। आज हम बात करेंगे कि बच्चों को समय पर टीका लगवाना क्यों ज़रूरी है। " +
  "टीका बच्चों को गंभीर बीमारियों से बचाता है। अपने नज़दीकी स्वास्थ्य केंद्र में जाकर टीकाकरण करवाइए।";

const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key-ID": key },
  body: JSON.stringify({
    text,
    model: "timbre-v3.0",
    voice: "Shivani",
    language: "hi-IN",
    speed: 1.0,
    audio_config: {
      sample_rate: 16000,
      num_channels: 1,
      sample_width: 2,
      encoding: "linear_pcm",
      container: "wav",
    },
  }),
});

if (!res.ok) {
  console.error("TTS failed:", res.status, await res.text());
  process.exit(1);
}

await mkdir("work", { recursive: true });
const buf = Buffer.from(await res.arrayBuffer());
await writeFile("work/sample_hi.wav", buf);
console.log(`Saved work/sample_hi.wav (${buf.length} bytes)`);
