// Step 5: mix fitted dub lines over the (ducked) original audio and mux into an MP4 (video copied, not re-encoded).
// Run:  node --env-file=.env scripts/05-mix.mjs [kn|ta|te] [inputVideo]
// If no inputVideo is given, a dark test video is made from work/sample_hi.wav.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LANG_CODES, duration } from "../src/tts.mjs";

const code = LANG_CODES[process.argv[2] ?? "kn"];
let video = process.argv[3];
const DUCK = 0.15; // original audio volume under the dub

if (!video) {
  video = "work/sample_hi.mp4";
  if (!existsSync(video)) {
    console.log("Making test video from work/sample_hi.wav ...");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x07080C:s=1280x720:r=25",
      "-i", "work/sample_hi.wav", "-t", String(duration("work/sample_hi.wav")), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", video]);
  }
}

const lines = JSON.parse(await readFile(`work/translated_${code}.json`, "utf8"));
if (lines.some((l) => !l.fit_file)) throw new Error("Run 04-fit first");

// Inputs: 0 = original video, then one input per dub line.
const args = ["-y", "-v", "error", "-i", video];
lines.forEach((l) => args.push("-i", l.fit_file));

const parts = [`[0:a]volume=${DUCK}[orig]`];
lines.forEach((l, i) => {
  const ms = Math.round(l.start * 1000);
  parts.push(`[${i + 1}:a]adelay=${ms}|${ms}[d${i}]`);
});
const labels = ["[orig]", ...lines.map((_, i) => `[d${i}]`)].join("");
parts.push(`${labels}amix=inputs=${lines.length + 1}:normalize=0:duration=first[mix]`);

const out = `work/dubbed_${code}.mp4`;
args.push("-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", out);
execFileSync("ffmpeg", args);

const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "default=nw=1", out]).toString();
console.log(`Saved ${out}\n${probe}`);
