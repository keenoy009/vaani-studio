import { useState } from "react";
import { api, LANGS, SOURCES } from "../api.js";

const CHECKS = ["Post is live on X or LinkedIn", "Gnani AI tagged, both hashtags added", "Demo video attached to the post"];
const CK = "vaani.checklist";
const loadChecks = () => { try { return JSON.parse(localStorage.getItem(CK)) || {}; } catch { return {}; } };

// Caption templates are filled with this job's real languages. No AI call, so nothing is invented.
export default function Captions({ job, langId, L }) {
  const [tab, setTab] = useState("x");
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(loadChecks);
  const names = LANGS.filter((l) => job.langs[l.id]).map((l) => l.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] || "Indian languages";
  const src = SOURCES[job.source];

  const text = {
    x: `Same video. ${names.length > 1 ? `${names.length} Indian languages` : `Now in ${list}`}. Each line reviewed by a human before it goes out.\n\nBuilt on @GnaniAi Prisma + Timbre for the Great Indian AI Internship Challenge.\n\n#GnaniAI #GreatIndianAIInternshipChallenge`,
    in: `Most videos are made in ${src}, but the people who need them speak ${list}.\n\nI built Vaani Studio: upload a video, review every translated line, and send the dubbed version to a Telegram group. It runs on Gnani AI's Prisma (speech-to-text) and Timbre (text-to-speech).\n\nBuilt for the Great Indian AI Internship Challenge.\n\n#GnaniAI #GreatIndianAIInternshipChallenge`,
  }[tab];

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  };
  const toggle = (i) => setDone((d) => {
    const n = { ...d, [i]: !d[i] };
    try { localStorage.setItem(CK, JSON.stringify(n)); } catch { /* storage blocked */ }
    return n;
  });

  return (
    <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[22px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xl font-extrabold tracking-[-0.02em]">Post your demo</span>
        <div role="tablist" aria-label="Platform" className="flex rounded-full bg-[#171A25] p-1">
          {[["x", "X"], ["in", "LinkedIn"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className="h-[30px] rounded-full border-0 px-4 text-[13px] font-bold"
              style={{ background: tab === id ? "#F1F3FA" : "transparent", color: tab === id ? "#0B0A18" : "#9AA3B8" }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="rounded-[18px] border border-line bg-well p-4 text-sm leading-relaxed whitespace-pre-line text-[#D8DCEA]">{text}</div>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={copy} className="h-12 min-w-[140px] flex-1 rounded-full border-0 bg-pink text-sm font-bold text-[#1B0B17]">{copied ? "Copied ✓" : "Copy caption"}</button>
        {L.dubbed
          ? <a href={api.clipUrl(job.id, langId, 60)} className="flex h-12 min-w-[140px] flex-1 items-center justify-center rounded-full border border-[#2C3247] text-sm font-bold text-ink no-underline">Export 60s clip</a>
          : <button type="button" disabled title="Render the dub first" className="h-12 min-w-[140px] flex-1 rounded-full border border-[#2C3247] bg-transparent text-sm font-bold text-[#6B7390]">Export 60s clip</button>}
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-1.5">
        <span className="pt-2.5 pb-1 text-[13px] font-bold text-mute">Before you submit</span>
        {CHECKS.map((c, i) => (
          <label key={i} className="flex cursor-pointer items-center gap-3 py-2 text-sm">
            <input type="checkbox" checked={!!done[i]} onChange={() => toggle(i)} className="m-0 h-[18px] w-[18px] accent-[#A99BFF]" />{c}
          </label>
        ))}
      </div>
    </section>
  );
}
