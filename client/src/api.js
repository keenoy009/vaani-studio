// Thin wrapper around the backend REST API. Every call throws Error(message) on failure.
async function handle(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const L = (id, lang) => `/api/jobs/${id}/langs/${lang}`;

export const api = {
  create(file, source, targets) {
    const fd = new FormData();
    fd.append("source", source);
    fd.append("targets", targets.join(","));
    fd.append("video", file); // file last so text fields are parsed first
    return fetch("/api/jobs", { method: "POST", body: fd }).then(handle);
  },
  get: (id) => fetch(`/api/jobs/${id}`).then(handle),
  addLang: (id, lang) => fetch(L(id, lang), { method: "POST" }).then(handle),
  edit: (id, lang, lineId, text) => fetch(`${L(id, lang)}/lines/${lineId}`, json("PATCH", { text })).then(handle),
  approve: (id, lang, lineId, approved) => fetch(`${L(id, lang)}/lines/${lineId}/approve`, json("POST", { approved })).then(handle),
  check: (id, lang, lineId) => fetch(`${L(id, lang)}/lines/${lineId}/check`, { method: "POST" }).then(handle),
  render: (id, lang) => fetch(`${L(id, lang)}/render`, { method: "POST" }).then(handle),
  sample: () => fetch("/api/samples", { method: "POST" }).then(handle),
  list: () => fetch("/api/jobs").then(handle),
  voices: () => fetch("/api/voices").then(handle),
  jobVoices: (id) => fetch(`/api/jobs/${id}/voices`).then(handle),
  setVoices: (id, body) => fetch(`/api/jobs/${id}/voices`, json("PUT", body)).then(handle),
  telegram: () => fetch("/api/telegram").then(handle),
  send: (id, lang) => fetch(`${L(id, lang)}/send`, { method: "POST" }).then(handle),
  clipUrl: (id, lang, secs = 60) => `${L(id, lang)}/video?clip=${secs}`,
  originalUrl: (id) => `/api/jobs/${id}/video`,
  dubUrl: (id, lang, v = 0) => `${L(id, lang)}/video?v=${v}`,
  downloadUrl: (id, lang) => `${L(id, lang)}/video?download=1`,
};

export const LANGS = [
  { id: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { id: "ta", name: "Tamil", native: "தமிழ்" },
  { id: "te", name: "Telugu", native: "తెలుగు" },
  { id: "mr", name: "Marathi", native: "मराठी" },
];
export const SOURCES = { hi: "Hindi", en: "English" };
export const fmt = (t) => {
  const n = Math.max(0, Math.floor(t || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
