import { useEffect, useMemo, useState } from "react";
import { api, LANGS, SOURCES, fmt } from "../api.js";
import { Viewers } from "./Telegram.jsx";

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

function Thumb({ id }) {
  const [bad, setBad] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[18px] bg-[#12142A]"
      style={{ backgroundImage: "radial-gradient(300px 160px at 15% 0%, rgba(139,123,255,0.45), transparent 65%), radial-gradient(300px 180px at 95% 100%, rgba(255,166,231,0.30), transparent 65%)" }}>
      {!bad && <img src={api.thumbUrl(id)} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" />}
      {bad && <div className="absolute inset-0 flex items-center justify-center text-lav/60"><Icon d="M5 4.5v15l13-7.5z" size={34} /></div>}
    </div>
  );
}

export function Library({ onOpen, currentId, onNew }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  useEffect(() => { api.list().then(setRows).catch(() => setRows([])); }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => (filter === "all" || stateOf(r) === filter) && r.originalName.toLowerCase().includes(q.trim().toLowerCase())), [rows, filter, q]);
  if (!rows) return <p className="text-mute">Loading…</p>;

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
        {shown.map((r) => (
          <article key={r.id} className="group flex flex-col gap-4 rounded-[26px] border bg-panel p-3.5 transition-colors hover:border-lav/60" style={{ borderColor: r.id === currentId ? "#A99BFF" : "#1E2232" }}>
            <div className="relative">
              <Thumb id={r.id} />
              {r.duration != null && <span className="absolute right-2.5 bottom-2.5 rounded-lg bg-[#07080C]/75 px-2 py-1 font-mono text-[11px] font-medium">{fmt(r.duration)}</span>}
              {r.id === currentId && <span className="absolute top-2.5 left-2.5 rounded-full bg-lav px-2.5 py-1 text-[11px] font-bold text-[#0B0A18]">Open now</span>}
            </div>
            <div className="flex flex-col gap-1 px-1.5">
              <span className="truncate text-base font-bold" title={r.originalName}>{r.originalName}</span>
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
            <button type="button" onClick={() => onOpen(r.id)} className="mx-1.5 mb-1 h-11 rounded-full border border-[#2C3247] bg-transparent text-sm font-bold text-ink group-hover:border-lav group-hover:text-lav">Open in Studio</button>
          </article>
        ))}
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

  const change = async (speaker, voice) => {
    try { setMine(await api.setVoices(job.id, { [speaker]: voice })); onChanged(); } catch (e) { onError(e.message); }
  };
  const initial = (name.trim()[0] || "V").toUpperCase();

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 max-xl:grid-cols-1">
      <div className="flex flex-col gap-6">
        <section className={`${card} flex flex-col gap-5`}>
          <CardHead icon="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" title="Dubbed voices" hint={job ? `Pick a voice for each speaker in “${job.originalName}”.` : "Voices are chosen per speaker, for each video."} />
          {!job && (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#343A55] bg-well p-5">
              <span className="text-sm text-mute">No video is open yet. Open one from the Library, or start a new dub.</span>
              <button type="button" onClick={onNew} className="h-10 rounded-full border-0 bg-lav px-5 text-[13px] font-bold text-[#0B0A18]">Dub a video</button>
            </div>
          )}
          {job && mine.length === 0 && <p className="m-0 text-sm text-mute">No speakers found yet.</p>}
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {mine.map((m, i) => {
              const v = voices.find((x) => x.name === m.voice);
              return (
                <div key={m.speaker} className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-well p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-extrabold text-[#0B0A18]" style={{ background: ORBS[i % 4] }}>S{i + 1}</span>
                    <div className="flex flex-col"><span className="text-[15px] font-bold">{m.label}</span><span className="text-xs text-mute">{v ? `${v.gender} · ${v.persona}` : ""}</span></div>
                  </div>
                  <select aria-label={`Voice for ${m.label}`} value={m.voice} onChange={(e) => change(m.speaker, e.target.value)}
                    className="h-11 rounded-full border border-[#2C3247] bg-panel px-4 text-sm font-semibold text-ink">
                    {voices.map((x) => <option key={x.name} value={x.name}>{x.name} · {x.gender}</option>)}
                  </select>
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
            <dt className="text-mute">Spoken language</dt><dd className="m-0 text-right font-semibold">Hindi, English</dd>
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
            <li>The bot itself is the next thing being built; it will start with the server.</li>
          </ol>
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
