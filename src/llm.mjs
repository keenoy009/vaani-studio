// Provider-agnostic LLM helper. Callers use askJson(); only this file knows about Gemini.
// Env: LLM_PROVIDER (gemini), LLM_API_KEY, LLM_MODEL (optional), LLM_FALLBACK_MODEL (optional)

const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const apiKey = process.env.LLM_API_KEY;
// Google sometimes answers 503 "high demand" for a whole model. Then we try the fallback model.
const MODELS = [process.env.LLM_MODEL || "gemini-3.5-flash-lite", process.env.LLM_FALLBACK_MODEL || "gemini-3.1-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The model occasionally adds a stray character after valid JSON (e.g. an extra "}"). Keep the first complete {...} or [...].
function parseLoose(text) {
  try { return JSON.parse(text); } catch { /* fall through to the tolerant reader */ }
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("The AI answer contained no JSON");
  const open = text[start], close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("The AI answer was cut off");
}

async function geminiJson(system, user) {
  let lastError;
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(45000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
      } catch (e) { // timeout / network blip
        lastError = new Error(`Gemini (${model}) request failed: ${e.message}`);
        await sleep(3000 * attempt);
        continue;
      }
      if (res.status === 429 || res.status === 503) {
        lastError = new Error(`Gemini (${model}) ${res.status}: busy`);
        await sleep(4000 * attempt);
        continue;
      }
      const body = await res.text();
      if (!res.ok) throw new Error(`Gemini (${model}) ${res.status}: ${body.slice(0, 300)}`);
      const text = JSON.parse(body).candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
      return parseLoose(text);
    }
    // this model stayed busy: fall through to the next one
  }
  throw new Error(`The translation service is busy right now. Please try again in a minute. (${lastError?.message})`);
}

/** Ask the LLM for a JSON answer. Returns parsed JSON. */
export async function askJson(system, user) {
  if (!apiKey) throw new Error("LLM_API_KEY missing in .env");
  if (provider === "gemini") return geminiJson(system, user);
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}
