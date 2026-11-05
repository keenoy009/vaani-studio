import { useState } from "react";
import { LANGS, SOURCES } from "../api.js";

// Caption templates are filled with this job's real languages. No AI call, so nothing is invented.
export default function Captions({ job }) {
  const [tab, setTab] = useState("x");
  const [copied, setCopied] = useState(false);
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
      <button type="button" onClick={copy} className="h-12 rounded-full border-0 bg-pink text-sm font-bold text-[#1B0B17]">{copied ? "Copied ✓" : "Copy caption"}</button>
      <p className="m-0 text-xs text-mute">Edit the wording before you post. Check the handle and hashtags against the challenge rules.</p>
    </section>
  );
}
