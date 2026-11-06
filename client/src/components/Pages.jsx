import { useEffect, useMemo, useState } from "react";
import { api, LANGS, SOURCES, displayName, fmt } from "../api.js";
import { Viewers } from "./Telegram.jsx";
import VoiceSelect from "./VoiceSelect.jsx";

const card = "rounded-[28px] border border-line bg-panel p-6";
const ORBS = ["linear-gradient(145deg,#7C6CFF,#C8BFFF)", "linear-gradient(145deg,#FF7ED8,#FFC2EE)", "linear-gradient(145deg,#FF9A63,#FFD0B3)", "linear-gradient(145deg,#38D9A0,#B5F5DC)"];

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

function Icon({ d, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
function CardHead({ icon, title, hint }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-lav/15 text-lav"><Icon d={icon} /></span>
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-extrabold tracking-[-0.02em]">{title}</span>
        {hint && <span className="text-[13px] leading-relaxed text-mute">{hint}</span>}
      </div>
    </div>
  );
}

// ======================= Library =======================
const FILTERS = [["all", "All"], ["done", "Dubbed"], ["working", "In progress"], ["failed", "Failed"]];
const stateOf = (r) => {
  if (r.status === "failed") return "failed";
  if (r.status === "processing") return "working";
  const langs = Object.values(r.langs);
  if (langs.some((l) => ["translating", "rendering"].includes(l.status))) return "working";
  return langs.some((l) => l.dubbed) ? "done" : "working";
};
const LANG_STYLE = {
  done: ["rgba(110,231,183,0.14)", "#6EE7B7", "Dubbed"],
  review: ["rgba(255,182,143,0.14)", "#FFB68F", "Needs re-render"],
  translating: ["rgba(169,155,255,0.16)", "#A99BFF", "Translating…"],
  rendering: ["rgba(169,155,255,0.16)", "#A99BFF", "Voicing…"],
  failed: ["rgba(255,166,231,0.14)", "#FFA6E7", "Failed"],
};

// The ONE default thumbnail, identical for every card, used only when a video has no frame to show
// (file missing or unreadable) and while a real frame is loading. Same palette as the rest of the interface.
const DEFAULT_BARS = [30, 52, 40, 68, 50, 82, 60, 94, 70, 100, 76, 90, 62, 84, 56, 72, 46, 60, 36, 50, 30, 40];
function Cover() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true"
      style={{ background: "radial-gradient(300px 170px at 8% 0%, rgba(139,123,255,0.42), transparent 65%), radial-gradient(300px 190px at 100% 100%, rgba(255,166,231,0.30), transparent 65%), #12142A" }}>
      <div className="absolute inset-x-8 bottom-4 flex h-[38%] items-end justify-center gap-[3px]">
        {DEFAULT_BARS.map((v, i) => <i key={i} className="block w-[5px] rounded-full opacity-45" style={{ height: `${v}%`, background: "linear-gradient(#A99BFF, #FFA6E7)" }} />)}
      </div>
      <div className="absolute inset-0 flex items-center justify-center pb-7">
        <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full border border-white/15 bg-white/10 text-[#E9E5FF] shadow-[0_0_40px_rgba(169,155,255,0.30)] backdrop-blur-sm">
          <Icon d="M5 4.5v15l13-7.5z" size={26} />
        </span>
      </div>
    </div>
  );
}

// Shows a real frame from the video (taken from the middle, by the server). The generated cover is
// only used for a video that has no frame at all (file missing or unreadable), and while the image loads.
function Thumb({ id }) {
  const [state, setState] = useState("loading"); // loading | photo | cover
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[18px] bg-[#12142A]">
      {state !== "photo" && <Cover />}
      {/* Kept on the page (just transparent) while loading: browsers never download lazy images that are display:none. */}
      {state !== "cover" && <img src={api.thumbUrl(id)} alt="" loading="lazy" onLoad={() => setState("photo")} onError={() => setState("cover")}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${state === "photo" ? "opacity-100" : "opacity-0"}`} />}
    </div>
  );
}

export function Library({ onOpen, currentId, onNew, onChanged, onDeleted }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // id being renamed
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(null); // id awaiting delete confirmation
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null); // { id, text }
  useEffect(() => { api.list().then(setRows).catch(() => setRows([])); }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => (filter === "all" || stateOf(r) === filter) && displayName(r).toLowerCase().includes(q.trim().toLowerCase())), [rows, filter, q]);
  if (!rows) return <p className="text-mute">Loading…</p>;

  const startRename = (r) => { setEditing(r.id); setDraft(displayName(r)); setMsg(null); };
  const saveName = async (r) => {
    const title = draft.trim();
    setEditing(null);
    if (!title || title === displayName(r)) return;
    try { await api.rename(r.id, title); setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, title } : x))); onChanged?.(); }
    catch (e) { setMsg({ id: r.id, text: e.message }); }
  };
  const remove = async (r) => {
    setBusyId(r.id);
    try { await api.remove(r.id); setRows((rs) => rs.filter((x) => x.id !== r.id)); if (r.id === currentId) onDeleted?.(); }
    catch (e) { setMsg({ id: r.id, text: e.message }); }
    setBusyId(null); setConfirming(null);
  };

  const dubs = rows.reduce((n, r) => n + Object.values(r.langs).filter((l) => l.dubbed).length, 0);
  const langsUsed = new Set(rows.flatMap((r) => Object.keys(r.langs))).size;
  const stats = [["Videos", rows.length, "M4 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4zM18 10l4-2v8l-4-2"], ["Dubbed versions", dubs, "M5 12.5l4.5 4.5L19 7.5"], ["Languages used", langsUsed, "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 0 0 18"]];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
        {stats.map(([label, n, d]) => (
          <div key={label} className="flex items-center gap-4 rounded-[22px] border border-line bg-panel px-5 py-4">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-pink/15 text-pink"><Icon d={d} size={20} /></span>
            <div className="flex flex-col"><span className="font-mono text-[28px] leading-none font-medium">{n}</span><span className="mt-1 text-[13px] text-mute">{label}</span></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter" className="flex rounded-full bg-[#171A25] p-1">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className="h-9 rounded-full border-0 px-4 text-[13px] font-bold"
              style={{ background: filter === id ? "#F1F3FA" : "transparent", color: filter === id ? "#0B0A18" : "#9AA3B8" }}>{label}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos" aria-label="Search videos"
          className="h-11 w-full max-w-[280px] rounded-full border border-[#2C3247] bg-panel px-5 text-sm text-ink placeholder:text-[#6B7390] max-sm:max-w-none" />
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-dashed border-[#343A55] bg-panel px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-lav/15 text-lav"><Icon d="M12 16V4M7 9l5-5 5 5M5 20h14" size={28} /></span>
          <span className="text-2xl font-extrabold tracking-[-0.02em]">Your dubs will appear here</span>
          <span className="max-w-[380px] text-sm text-mute">Upload a video in the Studio. Each one is saved here with its languages, so you can open it again any time.</span>
          <button type="button" onClick={onNew} className="h-12 rounded-full border-0 bg-lav px-7 text-sm font-bold text-[#0B0A18]">Dub a video</button>
        </div>
      )}
      {rows.length > 0 && shown.length === 0 && <p className="m-0 py-8 text-center text-mute">Nothing matches that filter.</p>}

      <div className="grid grid-cols-3 gap-5 max-xl:grid-cols-2 max-md:grid-cols-1">
        {shown.map((r) => {
          const name = displayName(r);
          const asking = confirming === r.id;
          return (
            <article key={r.id} className="group flex flex-col gap-4 rounded-[26px] border bg-panel p-3.5 transition-colors hover:border-lav/60" style={{ borderColor: r.id === currentId ? "#A99BFF" : "#1E2232" }}>
              <div className="relative">
                <Thumb id={r.id} />
                {r.duration != null && <span className="absolute right-2.5 bottom-2.5 rounded-lg bg-[#07080C]/75 px-2 py-1 font-mono text-[11px] font-medium">{fmt(r.duration)}</span>}
                {r.id === currentId && <span className="absolute top-2.5 left-2.5 rounded-full bg-lav px-2.5 py-1 text-[11px] font-bold text-[#0B0A18]">Open now</span>}
                <button type="button" aria-label={`Delete ${name}`} title="Delete" onClick={() => { setConfirming(r.id); setMsg(null); }}
                  className="absolute top-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-[#07080C]/65 p-0 text-ink hover:text-pink">
                  <Icon d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" size={17} />
                </button>
              </div>

              <div className="flex flex-col gap-1 px-1.5">
                {editing === r.id ? (
                  <input autoFocus value={draft} maxLength={80} aria-label="Video name" onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(r); if (e.key === "Escape") setEditing(null); }} onBlur={() => saveName(r)}
                    className="h-9 w-full rounded-lg border border-lav bg-well px-3 text-base font-bold text-ink" />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-base font-bold" title={name}>{name}</span>
                    <button type="button" aria-label={`Rename ${name}`} title="Rename" onClick={() => startRename(r)}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-mute hover:bg-white/5 hover:text-ink">
                      <Icon d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" size={16} />
                    </button>
                  </div>
                )}
                <span className="text-[13px] text-mute">{SOURCES[r.source]} · {ago(r.createdAt)}</span>
              </div>

              <div className="flex min-h-[28px] flex-wrap gap-1.5 px-1.5">
                {r.status === "processing" && <span className="rounded-full bg-lav/15 px-2.5 py-1 text-[11px] font-bold text-lav">Processing…</span>}
                {r.status === "failed" && <span className="rounded-full bg-pink/15 px-2.5 py-1 text-[11px] font-bold text-pink">Failed</span>}
                {Object.entries(r.langs).map(([k, v]) => {
                  const [bg, fg, label] = v.dubbed ? LANG_STYLE.done : LANG_STYLE[v.status] || LANG_STYLE.review;
                  return <span key={k} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: bg, color: fg }}>{LANGS.find((l) => l.id === k)?.name} · {label}</span>;
                })}
              </div>

              {msg?.id === r.id && <p role="alert" className="m-0 px-1.5 text-xs text-pink">{msg.text}</p>}

              {asking ? (
                <div className="mx-1.5 mb-1 flex flex-col gap-2.5 rounded-2xl border border-pink/40 bg-pink/10 p-3.5">
                  <span className="text-[13px] leading-relaxed text-ink">Delete this video and all its dubs? This can’t be undone.</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={busyId === r.id} onClick={() => remove(r)} className="h-10 flex-1 rounded-full border-0 bg-pink text-[13px] font-bold text-[#1B0B17] disabled:opacity-60">{busyId === r.id ? "Deleting…" : "Delete"}</button>
                    <button type="button" onClick={() => setConfirming(null)} className="h-10 flex-1 rounded-full border border-[#2C3247] bg-transparent text-[13px] font-bold text-ink">Keep</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => onOpen(r.id)} className="mx-1.5 mb-1 h-11 rounded-full border border-[#2C3247] bg-transparent text-sm font-bold text-ink group-hover:border-lav group-hover:text-lav">Open in Studio</button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ======================= Settings =======================
function StatusRow({ ok, title, hint, label }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-well px-4 py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-bold">{title}</span><span className="truncate text-xs text-mute">{hint}</span></div>
      <span className="inline-flex h-7 flex-none items-center gap-1.5 rounded-full px-3 text-xs font-bold" style={{ background: ok ? "rgba(110,231,183,0.12)" : "#232738", color: ok ? "#6EE7B7" : "#9AA3B8" }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ok ? "#6EE7B7" : "#6B7390" }} />{label}
      </span>
    </div>
  );
}

export function Settings({ job, name, setName, onChanged, onError, onNew }) {
  const [voices, setVoices] = useState([]);
  const [mine, setMine] = useState([]);
  const [status, setStatus] = useState(null);
  useEffect(() => { api.voices().then(setVoices).catch(() => {}); api.status().then(setStatus).catch(() => {}); }, []);
  useEffect(() => { if (job) api.jobVoices(job.id).then(setMine).catch(() => {}); else setMine([]); }, [job?.id]);

  const change = async (speaker, voice, consent) => {
    try { setMine(await api.setVoices(job.id, consent ? { [speaker]: voice, cloneConsent: true } : { [speaker]: voice })); onChanged(); } catch (e) { onError(e.message); }
  };
  const initial = (name.trim()[0] || "V").toUpperCase();

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 max-xl:grid-cols-1">
      <div className="flex flex-col gap-6">
        <section className={`${card} flex flex-col gap-5`}>
          <CardHead icon="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" title="Dubbed voices" hint={job ? `Pick a voice for each speaker in “${displayName(job)}”.` : "Voices are chosen per speaker, for each video."} />
          {!job && (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#343A55] bg-well p-5">
              <span className="text-sm text-mute">No video is open yet. Open one from the Library, or start a new dub.</span>
              <button type="button" onClick={onNew} className="h-10 rounded-full border-0 bg-lav px-5 text-[13px] font-bold text-[#0B0A18]">Dub a video</button>
            </div>
          )}
          {job && mine.length === 0 && <p className="m-0 text-sm text-mute">No speakers found yet.</p>}
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {mine.map((m, i) => {
              return (
                <div key={m.speaker} className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-well p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-extrabold text-[#0B0A18]" style={{ background: ORBS[i % 4] }}>S{i + 1}</span>
                    <div className="flex flex-col"><span className="text-[15px] font-bold">{m.label}</span><span className="text-xs text-mute">{m.speechSeconds} s of speech</span></div>
                  </div>
                  <VoiceSelect m={m} voices={voices} onChange={change} label={`Voice for ${m.label}`} />
                </div>
              );
            })}
          </div>
          {job && mine.length > 0 && <p className="m-0 text-xs leading-relaxed text-mute">Changing a voice affects every language of this video. Re-render afterwards to hear it. These are Gnani’s ready-made Timbre voices; voice cloning is not set up yet.</p>}
        </section>

        <section className={`${card} flex flex-col gap-5`}>
          <CardHead icon="M11 5 6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" title="Audio" hint="How the final video sounds." />
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-well p-4">
              <span className="text-[13px] text-mute">Original background audio</span>
              <span className="flex items-baseline gap-2"><span className="font-mono text-[30px] leading-none font-medium text-mint">0%</span><span className="text-sm font-semibold text-mint">Muted</span></span>
              <span className="text-xs leading-relaxed text-mute">Only the dubbed voices are heard. Original music and sound effects are removed too.</span>
            </div>
            <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-well p-4">
              <span className="text-[13px] text-mute">Time-fit speed range</span>
              <span className="font-mono text-[30px] leading-none font-medium">0.85–1.25×</span>
              <span className="text-xs leading-relaxed text-mute">Dubbed lines are sped up or slowed within this range; longer lines are shortened by AI.</span>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <section className={`${card} flex flex-col gap-5`}>
          <CardHead icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" title="Profile" hint="Stored only in this browser." />
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-gradient-to-br from-pink to-lav text-2xl font-extrabold text-[#1B0B17]">{initial}</span>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-mute">Display name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Your name"
                className="h-11 rounded-xl border border-[#2C3247] bg-well px-4 text-sm text-ink placeholder:text-[#6B7390]" />
            </label>
          </div>
        </section>

        <section className={`${card} flex flex-col gap-4`}>
          <CardHead icon="M5 12.5l4.5 4.5L19 7.5" title="Connections" hint="Which services are set up in your .env file." />
          {!status && <p className="m-0 text-sm text-mute">Checking…</p>}
          {status && (
            <div className="flex flex-col gap-2.5">
              <StatusRow ok={status.gnani} title="Gnani Vachana" hint="Speech-to-text (Prisma) and voices (Timbre)" label={status.gnani ? "Key found" : "Missing"} />
              <StatusRow ok={status.llm} title="Translation (Gemini)" hint={status.llmModel} label={status.llm ? "Key found" : "Missing"} />
              <StatusRow ok={status.telegramOnline} title="Telegram bot" hint={status.telegramToken ? "Token found" : "Add TELEGRAM_BOT_TOKEN to .env"} label={status.telegramOnline ? "Online" : status.telegramToken ? "Not running" : "Not set up"} />
            </div>
          )}
        </section>

        <section className={`${card} flex flex-col gap-4`}>
          <CardHead icon="M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" title="Limits" />
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-mute">Video length</dt><dd className="m-0 text-right font-semibold">up to about {status?.limits.maxMinutes ?? 5} minutes</dd>
            <dt className="text-mute">File size</dt><dd className="m-0 text-right font-semibold">up to {status?.limits.maxMB ?? 200} MB</dd>
            <dt className="text-mute">Formats</dt><dd className="m-0 text-right font-semibold">MP4, MOV, MKV, WEBM</dd>
            <dt className="text-mute">Spoken language</dt><dd className="m-0 text-right font-semibold">{Object.values(SOURCES).join(", ")}</dd>
            <dt className="text-mute">Dub into</dt><dd className="m-0 text-right font-semibold">{LANGS.map((l) => l.name).join(", ")}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

// ======================= Telegram bot page =======================
export function BotPage({ tg }) {
  return (
    <div className="grid grid-cols-2 gap-6 max-xl:grid-cols-1">
      <section className={`${card} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <CardHead icon="M21 3 10 14M21 3l-7 18-4-7-7-4z" title="Telegram bot" />
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold" style={{ background: tg.online ? "rgba(110,231,183,0.10)" : "#232738", color: tg.online ? "#6EE7B7" : "#9AA3B8" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tg.online ? "#6EE7B7" : "#6B7390" }} />{tg.online ? "Online" : "Offline"}
          </span>
        </div>
        {!tg.online && (
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-mute">
            <li>In Telegram, talk to <b className="text-ink">@BotFather</b> and send <code>/newbot</code>.</li>
            <li>Put the token it gives you in <code>.env</code> as <code>TELEGRAM_BOT_TOKEN=…</code>. Never share it.</li>
            <li>Restart the server (<code>npm start</code>). The bot starts together with it.</li>
          </ol>
        )}
        {tg.online && (
          <div className="flex flex-col gap-4">
            <a href={`https://t.me/${tg.botUsername}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-2xl bg-lav px-5 py-4 text-[#0B0A18] no-underline">
              <span className="flex flex-col"><span className="text-base font-extrabold">@{tg.botUsername}</span><span className="text-xs font-medium opacity-75">Open the bot in Telegram</span></span>
              <Icon d="M5 12h14M13 6l6 6-6 6" size={20} />
            </a>
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-mute">
              <li>Send the bot a video (up to 5 minutes and 20 MB).</li>
              <li>Pick the spoken language, then the language to dub into.</li>
              <li>You get the dubbed video back, with <b className="text-ink">Share to group</b> and <b className="text-ink">Change language</b> buttons.</li>
            </ol>
          </div>
        )}
      </section>
      <section className={`${card} flex flex-col gap-3`}>
        <CardHead icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" title="Groups and viewers" />
        {tg.groups.length === 0 && <p className="m-0 text-sm text-[#6B7390]">No groups linked yet.</p>}
        {tg.groups.map((g) => <div key={g.id} className="rounded-2xl border border-line bg-well px-4 py-3 text-sm font-bold">{g.name}{g.members ? <span className="font-normal text-mute"> · {g.members} members</span> : null}</div>)}
        <Viewers viewers={tg.viewers} />
      </section>
    </div>
  );
}
