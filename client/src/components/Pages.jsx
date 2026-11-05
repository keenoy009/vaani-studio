import { useEffect, useState } from "react";
import { api, LANGS, SOURCES } from "../api.js";
import { Viewers } from "./Telegram.jsx";

const card = "rounded-[28px] border border-line bg-panel p-[22px]";

// ---------- Library: every job on this server ----------
export function Library({ onOpen, currentId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.list().then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <p className="text-mute">Loading…</p>;
  return (
    <section className={`${card} flex flex-col gap-4`}>
      <span className="text-xl font-extrabold tracking-[-0.02em]">Library</span>
      {rows.length === 0 && <p className="m-0 text-mute">No dubs yet. Upload a video from the Studio page.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-well px-4 py-3.5" style={r.id === currentId ? { borderColor: "#A99BFF" } : {}}>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
            <span className="truncate text-[15px] font-bold">{r.originalName}</span>
            <span className="text-xs text-mute">{SOURCES[r.source]} · {new Date(r.createdAt).toLocaleString()}{r.duration ? ` · ${Math.round(r.duration)}s` : ""}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {r.status === "processing" && <span className="rounded-full bg-lav/15 px-2.5 py-1 text-[11px] font-bold text-lav">Processing…</span>}
            {r.status === "failed" && <span className="rounded-full bg-pink/15 px-2.5 py-1 text-[11px] font-bold text-pink">Failed</span>}
            {Object.entries(r.langs).map(([k, v]) => (
              <span key={k} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: v.dubbed ? "rgba(110,231,183,0.14)" : "#232738", color: v.dubbed ? "#6EE7B7" : "#9AA3B8" }}>
                {LANGS.find((l) => l.id === k)?.name} · {v.dubbed ? "dubbed" : v.status === "failed" ? "failed" : v.status === "review" ? "needs re-render" : "working…"}
              </span>
            ))}
          </div>
          <button type="button" onClick={() => onOpen(r.id)} className="h-[38px] rounded-full border border-[#2C3247] bg-transparent px-4 text-[13px] font-semibold text-ink">Open</button>
        </div>
      ))}
    </section>
  );
}

// ---------- Settings: per-speaker voices + display name ----------
export function Settings({ job, name, setName, onChanged, onError }) {
  const [voices, setVoices] = useState([]);
  const [mine, setMine] = useState([]);
  useEffect(() => { api.voices().then(setVoices).catch(() => {}); }, []);
  useEffect(() => { if (job) api.jobVoices(job.id).then(setMine).catch(() => {}); else setMine([]); }, [job?.id]);

  const change = async (speaker, voice) => {
    try { setMine(await api.setVoices(job.id, { [speaker]: voice })); onChanged(); } catch (e) { onError(e.message); }
  };
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <section className={`${card} flex flex-col gap-4`}>
        <span className="text-xl font-extrabold tracking-[-0.02em]">Voices for this video</span>
        {!job && <p className="m-0 text-mute">Open a video first. Voices are chosen per speaker, per video.</p>}
        {job && mine.length === 0 && <p className="m-0 text-mute">No speakers found yet.</p>}
        {mine.map((m) => (
          <label key={m.speaker} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-well px-4 py-3.5">
            <span className="text-[15px] font-bold">{m.label}</span>
            <select value={m.voice} onChange={(e) => change(m.speaker, e.target.value)} className="h-10 rounded-full border border-[#2C3247] bg-panel px-4 text-sm font-semibold text-ink">
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} · {v.gender} · {v.persona}</option>)}
            </select>
          </label>
        ))}
        {job && <p className="m-0 text-xs text-mute">These are Gnani’s ready-made Timbre voices. Changing a voice clears any rendered dub, so render it again afterwards. Voice cloning is not built yet.</p>}
      </section>
      <section className={`${card} flex flex-col gap-3`}>
        <span className="text-xl font-extrabold tracking-[-0.02em]">Profile</span>
        <label className="flex flex-col gap-2 text-sm text-mute">Your name (shown as the avatar letter, stored only in this browser)
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-11 rounded-xl border border-[#2C3247] bg-well px-4 text-ink" />
        </label>
      </section>
    </div>
  );
}

// ---------- Telegram bot page ----------
export function BotPage({ tg }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-[-0.02em]">Telegram bot</span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold" style={{ background: tg.online ? "rgba(110,231,183,0.10)" : "#232738", color: tg.online ? "#6EE7B7" : "#9AA3B8" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tg.online ? "#6EE7B7" : "#6B7390" }} />{tg.online ? "Online" : "Offline"}
          </span>
        </div>
        {!tg.online && (
          <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-mute">
            <li>In Telegram, talk to <b className="text-ink">@BotFather</b> and send <code>/newbot</code>.</li>
            <li>Put the token it gives you in <code>.env</code> as <code>TELEGRAM_BOT_TOKEN=…</code>. Never share it.</li>
            <li>The bot itself is the next thing being built; it will start with the server.</li>
          </ol>
        )}
      </section>
      <section className={`${card} flex flex-col gap-3`}>
        <span className="text-xl font-extrabold tracking-[-0.02em]">Groups</span>
        {tg.groups.length === 0 && <p className="m-0 text-sm text-[#6B7390]">No groups linked yet.</p>}
        {tg.groups.map((g) => <div key={g.id} className="rounded-2xl border border-line bg-well px-4 py-3 text-sm font-bold">{g.name}{g.members ? <span className="font-normal text-mute"> · {g.members} members</span> : null}</div>)}
        <Viewers viewers={tg.viewers} />
      </section>
    </div>
  );
}
