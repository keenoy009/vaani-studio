// Step 2: translate work/segments.json into a target language.
// Run:  node --env-file=.env scripts/02-translate.mjs [kn|ta|te]   (default kn)
import { readFile, writeFile } from "node:fs/promises";
import { askJson } from "../src/llm.mjs";

// `script` is a regex for the Unicode block each language must be written in.
const LANGS = {
  kn: { name: "Kannada", code: "kn-IN", script: /[ಀ-೿]/g, example: "ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ" },
  ta: { name: "Tamil", code: "ta-IN", script: /[஀-௿]/g, example: "வணக்கம் நண்பர்களே" },
  te: { name: "Telugu", code: "te-IN", script: /[ఀ-౿]/g, example: "నమస్కారం మిత్రులారా" },
};
const lang = LANGS[process.argv[2] ?? "kn"];
if (!lang) throw new Error("Language must be one of: " + Object.keys(LANGS).join(", "));

const segments = JSON.parse(await readFile("work/segments.json", "utf8"));

const system =
  `You are a professional dubbing translator. Translate Hindi speech into natural, spoken ${lang.name} ` +
  `for a voice-over. The output MUST be written in the native ${lang.name} script (for example "${lang.example}"), ` +
  `NOT Bengali, Devanagari, or Latin letters. Rules: keep the meaning; use simple everyday words suitable ` +
  `for health workers, farmers and students; keep each line about as long as the original when spoken, ` +
  `because it must fit the same time slot; write numbers as spoken words; do not add explanations. ` +
  `Reply ONLY with JSON: an array of objects {"id": number, "text": string}, one per input line, same ids.`;

const user = JSON.stringify(
  segments.map((s) => ({ id: s.id, seconds: +(s.end - s.start).toFixed(2), hindi: s.text }))
);

// Reject output that isn't mostly in the right script, and retry (up to 3 times).
function inRightScript(text) {
  const letters = text.replace(/[\s\d\p{P}]/gu, "");
  const good = (text.match(lang.script) || []).length;
  return letters.length > 0 && good / letters.length > 0.8;
}

let byId;
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = await askJson(system, user);
  byId = new Map(result.map((r) => [r.id, r.text]));
  const bad = segments.filter((s) => !inRightScript(byId.get(s.id) ?? ""));
  if (bad.length === 0) break;
  console.log(`Attempt ${attempt}: ${bad.length} line(s) not in ${lang.name} script, retrying...`);
  if (attempt === 3) throw new Error(`Gemini kept returning the wrong script for ${lang.name}`);
}

const out = segments.map((s) => {
  const text = byId.get(s.id);
  if (!text) throw new Error(`No translation returned for segment ${s.id}`);
  return { ...s, source_text: s.text, text, lang: lang.code, edited: false, approved: false };
});

await writeFile(`work/translated_${lang.code}.json`, JSON.stringify(out, null, 2));
console.log(`Saved work/translated_${lang.code}.json\n`);
for (const s of out) {
  console.log(`[${s.start.toFixed(2)}-${s.end.toFixed(2)}] (${(s.end - s.start).toFixed(1)}s)`);
  console.log("  HI:", s.source_text);
  console.log(`  ${lang.code.slice(0, 2).toUpperCase()}:`, s.text);
}
