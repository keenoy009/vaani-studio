import { useState } from "react";
import { api } from "../api.js";

export const HELP = "One word per line. To fix how a spoken word is written in the dub, use: spoken word = kept word";
export const toText = (g = []) => g.map((x) => (x.from === x.to ? x.from : `${x.from} = ${x.to}`)).join("\n");

// Words the dub must keep exactly as you write them (drug names, places, programmes, brands).
export function GlossaryInput({ value, onChange, rows = 4 }) {
  return (
    <div className="flex flex-col gap-2">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} spellCheck={false} maxLength={2000}
        placeholder={"Paracetamol\nपैरासिटामोल = Paracetamol\nASHA worker"}
        className="w-full resize-y rounded-2xl border border-[#262B40] bg-[#0C0E15] px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-lav" />
      <span className="text-[11px] leading-relaxed text-mute">{HELP}. Latin letters or the language's own script read best aloud.</span>
    </div>
  );
}

// Studio: edit the list of a video that is already uploaded. Applies to languages dubbed from now on.
export function GlossaryCard({ job, onChanged, onError }) {
  const saved = toText(job.glossary);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const count = (job.glossary ?? []).length;
  const save = async () => {
    setBusy(true); setDone(false);
    try { await api.setGlossary(job.id, text); setDone(true); await onChanged?.(); } catch (e) { onError?.(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-[#262B40] bg-[#12141D] p-4">
      <button type="button" onClick={() => { setOpen(!open); setText(saved); setDone(false); }} aria-expanded={open}
        className="flex items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-ink">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">Keep these words</span>
          <span className="text-xs text-mute">{count ? `${count} word${count > 1 ? "s" : ""} kept exactly in new dubs` : "Names and terms that must not be translated"}</span>
        </span>
        <span className="text-xs font-bold text-lav">{open ? "Close" : count ? "Edit" : "Add"}</span>
      </button>
      {open && (
        <>
          <GlossaryInput value={text} onChange={setText} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={busy || text === saved}
              className="h-10 rounded-full border-0 bg-ink px-5 text-[13px] font-bold text-[#0B0A18] disabled:opacity-40">{busy ? "Saving…" : "Save list"}</button>
            {done && <span className="text-xs text-mint">Saved. It applies to languages you dub from now on; a language already dubbed keeps its wording.</span>}
          </div>
        </>
      )}
    </div>
  );
}
