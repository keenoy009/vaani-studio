// One command: video in -> dubbed MP4 out (no human review step; for testing the pipeline).
// Run:  node --env-file=.env scripts/run.mjs <video> [kn|ta|te] [hi|en]
import { runAll, TARGETS } from "../src/pipeline.mjs";

const [video, targetKey = "kn", sourceKey = "hi"] = process.argv.slice(2);
if (!video || !TARGETS[targetKey]) {
  console.error("Usage: node --env-file=.env scripts/run.mjs <video> [kn|ta|te] [hi|en]");
  process.exit(1);
}
const dir = `work/jobs/run-${Date.now()}`;
const t0 = Date.now();
const { out, lines } = await runAll({
  video, targetKey, sourceKey, dir,
  onStage: (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}...`),
});
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
for (const l of lines) console.log(`  [${l.start.toFixed(1)}-${l.end.toFixed(1)}] speaker ${l.speaker} tempo ${l.tempo} ${l.fits ? "fits" : "TOO LONG"}${l.shortened ? " (shortened)" : ""}: ${l.text}`);
