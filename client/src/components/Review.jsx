import { useState } from "react";
import { fmt } from "../api.js";

const DOTS = ["#A99BFF", "#FFA6E7", "#FFB68F", "#6EE7B7"];

// Timing badge from the REAL measured length of the rendered line (only shown while the dub is up to date).
function Timing({ line }) {
  if (!line.fit_seconds) return null;
  const slot = line.end - line.start;
  const over = line.fit_seconds - slot;
  const [text, fg, bg] = !line.fits
    ? [`runs ${over.toFixed(1)}s over its slot`, "#FFA6E7", "rgba(255,166,231,0.14)"]
    : line.tempo > 1.02 ? [`sped up ${line.tempo}× to fit`, "#FFB68F", "rgba(255,182,143,0.12)"]
    : ["fits", "#6EE7B7", "rgba(110,231,183,0.12)"];
  return <span className="inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-bold" style={{ color: fg, background: bg }}>{text}</span>;
}

export default function Review({ job, langId, L, actions, seek }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [busyLine, setBusyLine] = useState(null);

  const speakers = [...new Set(job.segments.map((s) => s.speaker))].sort((a, b) => a - b);
  const working = L.status === "translating" || L.status === "rendering";
  const stale = !L.dubbed && L.status === "review"; // text or voice changed since the last render

  const save = async (id) => { setBusyLine(id); await actions.edit(id, draft); setBusyLine(null); setEditing(null); };

  return (
    <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-xl font-extrabold tracking-[-0.02em]">Translation</span>
        <span className="text-[13px] text-mute">
          {L.status === "translating" ? "Translating…"
            : L.status === "rendering" ? "Voicing and mixing…"
            : L.status === "failed" ? "Something went wrong"
            : stale ? "Changed since the last render" : "Edit any line if you want, then re-render"}
        </span>
      </div>

      {L.status === "failed" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          <span>{L.error}</span>
          <button type="button" onClick={() => (L.lines.length ? actions.render() : actions.addLang(langId))} className="h-9 rounded-full border-0 bg-pink px-4 text-[13px] font-bold text-[#1B0B17]">Try again</button>
        </div>
      )}
      {working && L.lines.length === 0 && <p className="m-0 text-sm text-mute">The translated lines will appear here in a moment.</p>}

      <div className="flex flex-col gap-2.5">
        {L.lines.map((l, idx) => {
          const isEd = editing === l.id;
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-well px-4 py-3.5">
              <button type="button" aria-label={`Play line ${idx + 1} from ${fmt(l.start)}`} onClick={() => seek(l.start)}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-0 bg-[#1E2232] p-0 text-ink">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
              </button>

              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                  <span className="h-2 w-2 rounded-full" style={{ background: DOTS[speakers.indexOf(l.speaker) % DOTS.length] }} />
                  Speaker {speakers.indexOf(l.speaker) + 1} · <span className="font-mono">{fmt(l.start)}–{fmt(l.end)}</span>
                  {l.edited && <span className="rounded-full bg-lav/15 px-2 py-0.5 text-[11px] font-bold text-lav">edited</span>}
                  {l.shortened && <span className="rounded-full bg-peach/15 px-2 py-0.5 text-[11px] font-bold text-peach" title="The translation was too long for its time slot, so it was shortened automatically">shortened to fit</span>}
                  {l.lengthened && <span className="rounded-full bg-peach/15 px-2 py-0.5 text-[11px] font-bold text-peach" title="The translation was much shorter than the original speech, so it was reworded a little fuller to avoid a silent gap">lengthened to fit</span>}
                </div>
                <div className="text-[13px] text-[#8A93A8]">{l.source_text}</div>
                {isEd ? (
                  <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit translation for line ${idx + 1}`}
                    className="box-border w-full resize-none rounded-xl border border-lav bg-well px-3 py-2.5 text-[17px] leading-snug font-semibold text-ink" />
                ) : (
                  <div className="text-lg leading-snug font-semibold">{l.text}</div>
                )}
                {L.dubbed && !isEd && <div><Timing line={l} /></div>}
              </div>

              <div className="flex flex-wrap gap-2">
                {isEd ? (
                  <>
                    <button type="button" disabled={busyLine === l.id || !draft.trim()} onClick={() => save(l.id)} className="h-[38px] rounded-full border-0 bg-lav px-4 text-[13px] font-bold text-[#0B0A18] disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className="h-[38px] rounded-full border border-[#2C3247] bg-transparent px-4 text-[13px] font-semibold text-ink">Cancel</button>
                  </>
                ) : (
                  <button type="button" disabled={working} onClick={() => { setEditing(l.id); setDraft(l.text); }} className="h-[38px] rounded-full border border-[#2C3247] bg-transparent px-4 text-[13px] font-semibold text-ink disabled:opacity-50">Edit</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-sm text-mute">Your changes are not in the dubbed video yet.</span>
          <button type="button" onClick={actions.render} className="h-12 rounded-full border-0 bg-pink px-7 text-sm font-bold text-[#1B0B17]">Re-render dubbed video</button>
        </div>
      )}
    </section>
  );
}
