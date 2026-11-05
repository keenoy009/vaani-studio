// Provider-agnostic LLM helper. Callers use askJson(); only this file knows about Gemini.
// Env: LLM_PROVIDER (gemini), LLM_API_KEY, LLM_MODEL (optional)

const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL || "gemini-3.5-flash-lite";

async function geminiJson(system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if ((res.status === 429 || res.status === 503) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 8000 * attempt));
      continue;
    }
    const body = await res.text();
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 400)}`);
    const text = JSON.parse(body).candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    return JSON.parse(text);
  }
}

/** Ask the LLM for a JSON answer. Returns parsed JSON. */
export async function askJson(system, user) {
  if (!apiKey) throw new Error("LLM_API_KEY missing in .env");
  if (provider === "gemini") return geminiJson(system, user);
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}
