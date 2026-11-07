import { useEffect, useRef, useState } from "react";
import { api, LANGS } from "../api.js";

const MAX = 1200;
const AT_ONCE = 2; // how many languages are voiced at the same time

const Spinner = () => <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-lav/30 border-t-lav" aria-hidden="true" />;

// "Voice a message": type or paste text, pick languages and a voice, get speech back. No video needed.
export default function Speak({ onError }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("auto");
  const [targets, setTargets] = useState(["kn"]);
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState("Shivani");
  const [results, setResults] = useState({}); // lang id -> { status: "working" | "done" | "failed", ... }
  const [busy, setBusy] = useState(false);
  const run = useRef(0); // a new run makes older ones stop updating the screen
  useEffect(() => { api.voices().then(setVoices).catch(() => {}); }, []);

  const toggle = (id) => setTargets((t) => (t.includes(id) ? (t.length > 1 ? t.filter((x) => x !== id) : t) : [...t, id]));
  const left = MAX - text.length;
  const canGo = text.trim().length > 0 && left >= 0 && targets.length > 0 && !busy;

  const voiceOne = async (lang, myRun) => {
    const set = (v) => { if (run.current === myRun) setResults((r) => ({ ...r, [lang]: v })); };
    set({ status: "working" });
    try { set({ status: "done", ...(await api.speak({ text, from, to: lang, voice })) }); }
    catch (e) { set({ status: "failed", error: e.message }); }
  };
  const go = async () => {
    const myRun = ++run.current;
    onError?.("");
    setBusy(true);
    setResults(Object.fromEntries(targets.map((t) => [t, { status: "queued" }])));
    const queue = [...targets];
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => { while (queue.length) await voiceOne(queue.shift(), myRun); }));
    if (run.current === myRun) setBusy(false);
  };

  const shown = LANGS.filter((l) => results[l.id]);
  const voiceInfo = voices.find((v) => v.name === voice);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6 max-xl:grid-cols-1">
      {/* ---------- the message ---------- */}
      <section className="flex flex-col gap-5 rounded-[28px] border border-line bg-panel p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-[0.16em] text-lav">VOICE A MESSAGE</span>
          <h2 className="m-0 text-[24px] leading-tight font-extrabold tracking-[-0.02em]">Type it once. Hear it in any language.</h2>
          <p className="m-0 text-sm leading-relaxed text-mute">For announcements, reminders and health tips. Nothing to upload: write the message, choose the languages, and get audio you can play or download.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="speak-text" className="text-sm font-bold">Your message</label>
          <textarea id="speak-text" value={text} onChange={(e) => setText(e.target.value)} rows={6}
            placeholder="For example: Wash your hands with soap before you eat, and boil water before drinking it."
            className="w-full resize-y rounded-2xl border border-[#262B40] bg-[#0C0E15] px-4 py-3.5 text-[15px] leading-relaxed text-ink outline-none focus:border-lav" />
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-mute">Written in
              <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Language the message is written in"
                className="h-9 rounded-full border border-[#2C3247] bg-panel px-3 text-xs font-semibold text-ink">
                <option value="auto">Detect automatically</option>
                {LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <span className={left < 0 ? "font-bold text-pink" : left < 100 ? "text-peach" : "text-mute"}>{left} left</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-bold">Speak it in <span className="font-normal text-mute">· {targets.length} selected</span></span>
          <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-2">
            {LANGS.map((l) => {
              const on = targets.includes(l.id);
              return (
                <button key={l.id} type="button" aria-pressed={on} onClick={() => toggle(l.id)}
                  className="flex flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-ink"
                  style={{ border: `1px solid ${on ? "#A99BFF" : "#262B40"}`, background: on ? "linear-gradient(145deg, rgba(139,123,255,0.22), rgba(255,166,231,0.10))" : "#12141D" }}>
                  <span className="text-[17px] leading-snug font-bold">{l.native}</span>
                  <span className="text-[11px] text-mute">{l.name}{l.experimental && <span className="ml-1.5 rounded-full bg-[#2A2236] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-peach">EXPERIMENTAL</span>}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="speak-voice" className="text-sm font-bold">Voice</label>
          <select id="speak-voice" value={voice} onChange={(e) => setVoice(e.target.value)}
            className="h-11 rounded-full border border-[#2C3247] bg-panel px-4 text-sm font-semibold text-ink">
            {voices.length === 0 && <option value="Shivani">Shivani</option>}
            {voices.map((v) => <option key={v.name} value={v.name}>{v.name} · {v.gender} · {v.persona}</option>)}
          </select>
          {voiceInfo && <span className="text-[11px] text-mute">{voiceInfo.name} sounds {voiceInfo.persona.toLowerCase()}. Studio voices only here; copying a real person's voice needs a video of them.</span>}
        </div>

        <button type="button" disabled={!canGo} onClick={go}
          className="flex h-14 items-center justify-center gap-2 rounded-full border-0 text-[15px] font-extrabold"
          style={{ background: canGo ? "linear-gradient(90deg,#A99BFF,#FFA6E7)" : "#232738", color: canGo ? "#0B0A18" : "#6B7390", boxShadow: canGo ? "0 10px 30px rgba(169,155,255,0.30)" : "none" }}>
          {busy ? <><Spinner /> Recording…</> : `Create ${targets.length > 1 ? `${targets.length} voice messages` : "voice message"}`}
        </button>
      </section>

      {/* ---------- results ---------- */}
      <section className="flex flex-col gap-3.5" aria-live="polite">
        {shown.length === 0 && (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-[#343A55] bg-[#0C0E15] p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lav/15 text-lav">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4" /></svg>
            </span>
            <span className="text-base font-bold">Your voice messages appear here</span>
            <span className="max-w-[320px] text-sm leading-relaxed text-mute">Each language gets its own player, the translated text, and a download button.</span>
          </div>
        )}
        {shown.map((l) => {
          const r = results[l.id];
          return (
            <article key={l.id} className="flex flex-col gap-3 rounded-[24px] border border-line bg-panel p-4">
              <header className="flex items-center justify-between gap-3">
                <span className="flex items-baseline gap-2"><span className="text-xl font-bold">{l.native}</span><span className="text-xs text-mute">{l.name}{l.experimental ? " · experimental" : ""}</span></span>
                {r.status === "done" && <span className="rounded-full bg-mint/10 px-2.5 py-1 text-[11px] font-bold text-mint">{r.seconds}s</span>}
                {(r.status === "working" || r.status === "queued") && <span className="flex items-center gap-2 text-xs text-mute"><Spinner />{r.status === "queued" ? "Waiting" : "Translating and recording"}</span>}
              </header>
              {r.status === "done" && (
                <>
                  <p lang={l.id} className="m-0 rounded-2xl bg-well px-4 py-3 text-[15px] leading-relaxed">{r.text}</p>
                  {r.termsMissed?.length > 0 && <span className="text-xs text-pink">Could not keep: {r.termsMissed.join(", ")}. Check the text above.</span>}
                  <audio controls preload="metadata" src={api.speakAudio(r.id)} className="w-full" />
                  <div className="flex flex-wrap gap-2.5">
                    <a href={api.speakAudio(r.id, "mp3", true)} className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[13px] font-bold text-[#0B0A18] no-underline">Download MP3</a>
                    <a href={api.speakAudio(r.id, "wav", true)} className="inline-flex h-10 items-center rounded-full border border-[#2C3247] px-5 text-[13px] font-bold text-ink no-underline">WAV</a>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(r.text).catch(() => {})} className="h-10 rounded-full border border-[#2C3247] bg-transparent px-5 text-[13px] font-bold text-ink">Copy text</button>
                  </div>
                </>
              )}
              {r.status === "failed" && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-sm text-pink">{r.error}</span>
                  <button type="button" disabled={busy} onClick={() => { const myRun = run.current; setBusy(true); voiceOne(l.id, myRun).finally(() => setBusy(false)); }}
                    className="h-10 self-start rounded-full border border-[#2C3247] bg-transparent px-5 text-[13px] font-bold text-ink disabled:opacity-50">Try again</button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
