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
  render: (id, lang) => fetch(`${L(id, lang)}/render`, { method: "POST" }).then(handle),
  rename: (id, title) => fetch(`/api/jobs/${id}`, json("PATCH", { title })).then(handle),
  remove: (id) => fetch(`/api/jobs/${id}`, { method: "DELETE" }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not delete"); }),
  status: () => fetch("/api/status").then(handle),
  thumbUrl: (id) => `/api/jobs/${id}/thumb`,
  sample: () => fetch("/api/samples", { method: "POST" }).then(handle),
  list: () => fetch("/api/jobs").then(handle),
  voices: () => fetch("/api/voices").then(handle),
  jobVoices: (id) => fetch(`/api/jobs/${id}/voices`).then(handle),
  setVoices: (id, body) => fetch(`/api/jobs/${id}/voices`, json("PUT", body)).then(handle),
  telegram: () => fetch("/api/telegram").then(handle),
  originalUrl: (id) => `/api/jobs/${id}/video`,
  dubUrl: (id, lang, v = 0) => `${L(id, lang)}/video?v=${v}`,
  downloadUrl: (id, lang) => `${L(id, lang)}/video?download=1`,
};

export const LANGS = [
  { id: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { id: "ta", name: "Tamil", native: "தமிழ்" },
  { id: "te", name: "Telugu", native: "తెలుగు" },
  { id: "mr", name: "Marathi", native: "मराठी" },
  { id: "ml", name: "Malayalam", native: "മലയാളം" },
  { id: "bn", name: "Bengali", native: "বাংলা" },
  { id: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { id: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { id: "hi", name: "Hindi", native: "हिन्दी" },
  { id: "en", name: "English", native: "English" },
]; // all 10 languages from the brief; a video can't be dubbed into its own spoken language
// Spoken languages we can transcribe (Gujarati and Punjabi are not supported by Gnani's batch speech-to-text).
export const SOURCES = { hi: "Hindi", en: "English", kn: "Kannada", ta: "Tamil", te: "Telugu", ml: "Malayalam", mr: "Marathi", bn: "Bengali" };

// What to show as a video's name: the name the user chose, or a tidied-up file name.
export const displayName = (job) => job.title || job.originalName.replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
export const fmt = (t) => {
  const n = Math.max(0, Math.floor(t || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
