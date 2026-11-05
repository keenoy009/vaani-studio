import { useCallback, useEffect, useRef, useState } from "react";
import { api, LANGS, SOURCES } from "./api.js";
import Upload from "./components/Upload.jsx";
import Processing from "./components/Processing.jsx";
import Player from "./components/Player.jsx";
import Timing from "./components/Timing.jsx";
import Review from "./components/Review.jsx";
import Telegram, { useTelegram } from "./components/Telegram.jsx";
import Captions from "./components/Captions.jsx";
import { Library, Settings, BotPage } from "./components/Pages.jsx";

const store = (key) => ({
  get: () => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (v) => { try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key); } catch { /* storage blocked */ } },
});
const jobStore = store("vaani.jobId");
const nameStore = store("vaani.name");

const NAV = [
  { id: "studio", label: "Studio", d: "M4 12h2M8 8v8M12 4v16M16 8v8M20 12h-2" },
  { id: "library", label: "Library", d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { id: "bot", label: "Telegram bot", d: "M21 3 10 14M21 3l-7 18-4-7-7-4z" },
  { id: "settings", label: "Settings", d: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4" },
];
const TITLES = { studio: "Dubbing Studio", library: "Library", bot: "Telegram bot", settings: "Settings" };

export default function App() {
  // ?job=<id> in the address bar opens that job (handy for sharing/debugging); otherwise the last one used.
  const [jobId, setJobId] = useState(() => new URLSearchParams(location.search).get("job") || jobStore.get());
  const [job, setJob] = useState(null);
  const [page, setPage] = useState(() => { const p = new URLSearchParams(location.search).get("page"); return NAV.some((n) => n.id === p) ? p : "studio"; });
  const [lang, setLang] = useState(null);
  const [mode, setMode] = useState("orig"); // orig | dub
  const [checks, setChecks] = useState({}); // "kn-0" -> timing check result
  const [err, setErr] = useState("");
  const [dubVer, setDubVer] = useState(0); // bumps when a new dub finishes so <video> reloads
  const [t, setT] = useState(0);
  const [name, setNameState] = useState(nameStore.get() || "");
  const playerRef = useRef(null);
  const tg = useTelegram();

  const setName = (v) => { setNameState(v); nameStore.set(v); };

  const refresh = useCallback(async () => {
    if (!jobId) return;
    try {
      setJob(await api.get(jobId));
    } catch (e) {
      if (/not found/i.test(e.message)) { jobStore.set(null); setJobId(null); setJob(null); }
      else setErr(e.message);
    }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while the server is working in the background.
  const busy = job && (job.status === "processing" || Object.values(job.langs).some((l) => ["translating", "rendering"].includes(l.status)));
  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(refresh, 2000);
    return () => clearInterval(iv);
  }, [busy, refresh]);

  useEffect(() => {
    if (!job) return;
    const ids = Object.keys(job.langs);
    if (ids.length && !ids.includes(lang)) setLang(ids[0]);
  }, [job, lang]);

  // When a render finishes, show the dubbed version.
  const L = job && lang ? job.langs[lang] : null;
  const wasRendering = useRef(false);
  useEffect(() => {
    if (!L) return;
    if (wasRendering.current && L.status === "done") { setDubVer((v) => v + 1); setMode("dub"); }
    wasRendering.current = L.status === "rendering";
    if (!L.dubbed && mode === "dub") setMode("orig");
  }, [L, mode]);

  const guard = (fn) => async (...a) => {
    setErr("");
    try { return await fn(...a); } catch (e) { setErr(e.message); }
  };

  const open = (id) => { jobStore.set(id); setJobId(id); setJob(null); setLang(null); setChecks({}); setMode("orig"); setT(0); setPage("studio"); };
  const onUpload = guard(async (file, source, targets) => { open((await api.create(file, source, targets)).id); });
  const onSample = guard(async () => { open((await api.sample()).id); });
  const newDub = () => { jobStore.set(null); setJobId(null); setJob(null); setLang(null); setChecks({}); setErr(""); setPage("studio"); };

  const actions = {
    edit: guard(async (lineId, text) => { await api.edit(job.id, lang, lineId, text); await refresh(); }),
    approve: guard(async (lineId, approved) => { await api.approve(job.id, lang, lineId, approved); await refresh(); }),
    render: guard(async () => { await api.render(job.id, lang); await refresh(); }),
    addLang: guard(async (id) => { await api.addLang(job.id, id); setLang(id); await refresh(); }),
    check: guard(async (lineId) => {
      const line = L.lines.find((l) => l.id === lineId);
      const r = await api.check(job.id, lang, lineId);
      setChecks((c) => ({ ...c, [`${lang}-${lineId}`]: { ...r, text: line.text } }));
    }),
  };

  const view = !jobId ? "upload" : !job ? "loading" : job.status === "processing" ? "processing" : job.status === "failed" ? "failed" : "studio";
  const speakerCount = job ? new Set(job.segments.map((s) => s.speaker)).size : 0;

  return (
    <div className="flex min-h-screen flex-wrap">
      <nav aria-label="Main" className="flex w-[92px] flex-none flex-col items-center gap-3.5 border-r border-[#151824] py-7 max-sm:w-full max-sm:flex-row max-sm:justify-center max-sm:border-r-0 max-sm:border-b max-sm:py-3">
        <div className="mb-4 flex flex-col items-center gap-2 max-sm:mb-0 max-sm:flex-row">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8B7BFF] to-[#C8BFFF]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B0A18" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 9v6M9.5 5v14M14.5 8v8M19 10.5v3" /></svg>
          </div>
          <span className="text-[10px] font-bold tracking-[0.14em] text-mute">VAANI</span>
        </div>
        {NAV.map((n) => {
          const on = page === n.id;
          return (
            <button key={n.id} type="button" aria-label={n.label} title={n.label} aria-current={on ? "page" : undefined} onClick={() => setPage(n.id)}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-0 p-0"
              style={{ background: on ? "#FFA6E7" : "transparent", color: on ? "#1B0B17" : "#8A93A8" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.d} /></svg>
            </button>
          );
        })}
      </nav>

      <main className="flex min-w-0 flex-1 basis-[600px] flex-col gap-6 px-8 pt-7 pb-10 max-sm:px-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[36px] leading-[1.1] font-extrabold tracking-[-0.03em] max-sm:text-[28px]">{TITLES[page]}</h1>
            <span className="text-sm text-mute">
              {page !== "studio" ? "Vaani Studio" : job ? `${job.originalName} · ${SOURCES[job.source]}${speakerCount ? ` · ${speakerCount} speaker${speakerCount > 1 ? "s" : ""}` : ""}` : "Upload a video to start"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={newDub} className="inline-flex h-11 items-center gap-2 rounded-full border-0 bg-lav px-[22px] text-sm font-bold text-[#0B0A18]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              New dub
            </button>
            <button type="button" aria-label="Profile and settings" onClick={() => setPage("settings")}
              className="flex h-11 w-11 items-center justify-center rounded-full border-0 bg-gradient-to-br from-pink to-lav text-[15px] font-extrabold text-[#1B0B17]">{(name.trim()[0] || "V").toUpperCase()}</button>
          </div>
        </header>

        {err && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
            <span>{err}</span>
            <button type="button" onClick={() => setErr("")} className="border-0 bg-transparent text-pink" aria-label="Dismiss">✕</button>
          </div>
        )}

        {page === "library" && <Library onOpen={open} currentId={jobId} />}
        {page === "bot" && <BotPage tg={tg} />}
        {page === "settings" && <Settings job={job} name={name} setName={setName} onChanged={refresh} onError={setErr} />}

        {page === "studio" && (
          <>
            {view === "loading" && <p className="text-mute">Loading…</p>}
            {view === "upload" && <Upload onUpload={onUpload} onSample={onSample} />}
            {view === "processing" && <Processing job={job} />}
            {view === "failed" && (
              <div className="rounded-[28px] border border-line bg-panel p-8">
                <p className="m-0 text-xl font-extrabold">This job failed</p>
                <p className="mt-2 text-mute">{job.error}</p>
                <button type="button" onClick={newDub} className="mt-5 h-12 rounded-full border-0 bg-lav px-7 font-bold text-[#0B0A18]">Start over</button>
              </div>
            )}

            {view === "studio" && L && (
              <div className="flex flex-wrap items-start gap-6">
                <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-6">
                  <section className="flex flex-col gap-3.5 rounded-[28px] border border-line bg-panel p-3.5">
                    <Player ref={playerRef} job={job} langId={lang} L={L} mode={mode} setMode={setMode} dubVer={dubVer} onTime={setT} />
                    <Timing job={job} langId={lang} L={L} checks={checks} t={t} onSeek={(s) => playerRef.current?.seek(s)} />
                    <div className="grid grid-cols-4 gap-2.5 px-0.5 pb-0.5 max-md:grid-cols-2">
                      {LANGS.map((l) => {
                        const data = job.langs[l.id];
                        const active = lang === l.id;
                        const label = !data ? "Add language" : { translating: "Translating…", review: "In review", rendering: "Rendering…", done: "Dub ready", failed: "Failed" }[data.status];
                        const dot = !data ? "#4A5068" : data.status === "done" ? "#6EE7B7" : data.status === "failed" ? "#FFA6E7" : "#A99BFF";
                        return (
                          <button key={l.id} type="button" aria-pressed={active}
                            onClick={() => (data ? setLang(l.id) : actions.addLang(l.id))}
                            className="flex flex-col gap-1 rounded-[18px] p-4 text-left text-ink"
                            style={{ border: `1px solid ${active ? "#A99BFF" : "#262B40"}`, background: active ? "rgba(169,155,255,0.12)" : "#12141D" }}>
                            <span className="text-xl font-bold">{l.native}</span>
                            <span className="flex items-center gap-1.5 text-xs text-mute"><span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />{l.name} · {label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <Review job={job} langId={lang} L={L} checks={checks} actions={actions} seek={(s) => playerRef.current?.seek(s)} />
                </div>

                <aside className="flex min-w-0 max-w-[420px] flex-[1_1_380px] flex-col gap-6 max-lg:max-w-none">
                  <Telegram job={job} langId={lang} L={L} tg={tg} onError={setErr} />
                  <Captions job={job} langId={lang} L={L} />
                </aside>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
