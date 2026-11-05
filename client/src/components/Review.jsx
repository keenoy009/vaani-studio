import { useState } from "react";
import { fmt } from "../api.js";

const DOTS = ["#A99BFF", "#FFA6E7", "#FFB68F", "#6EE7B7"];

function Chip({ check }) {
  if (!check) return null;
  const r = check.ratio;
  const [text, fg, bg] =
    r <= 1.0 ? [`fits · ${check.spoken}s in ${check.slot}s`, "#6EE7B7", "rgba(110,231,183,0.12)"]
    : r <= 1.25 ? [`will be sped up ${r}× · ${check.spoken}s in ${check.slot}s`, "#FFB68F", "rgba(255,182,143,0.12)"]
    : [`too long ${r}× · ${check.spoken}s in ${check.slot}s`, "#FFA6E7", "rgba(255,166,231,0.14)"];
  return <span className="inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] font-bold" style={{ color: fg, background: bg }}>{text}</span>;
}

export default function Review({ job, langId, L, checks, actions, seek }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState({}); // lineId -> true while a request is in flight
  const [checkingAll, setCheckingAll] = useState(false);

  const speakers = [...new Set(job.segments.map((s) => s.speaker))].sort((a, b) => a - b);
  const total = L.lines.length;
  const approved = L.lines.filter((l) => l.approved).length;
  const locked = L.status === "translating" || L.status === "rendering";
  const allOk = total > 0 && approved === total;

  const run = async (id, fn) => { setPending((p) => ({ ...p, [id]: true })); try { await fn(); } finally { setPending((p) => ({ ...p, [id]: false })); } };
  const checkAll = async () => { setCheckingAll(true); for (const l of L.lines) await actions.check(l.id); setCheckingAll(false); };
  const save = async (id) => { await run(id, () => actions.edit(id, draft)); setEditing(null); };

  return (
    <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-xl font-extrabold tracking-[-0.02em]">Review the lines</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-bold"
            style={{ background: allOk ? "rgba(110,231,183,0.14)" : "rgba(169,155,255,0.14)", color: allOk ? "#6EE7B7" : "#A99BFF" }}>{approved} of {total} approved</span>
          <button type="button" disabled={checkingAll || locked} onClick={checkAll}
            className="h-8 rounded-full border border-[#2C3247] bg-transparent px-3.5 text-[13px] font-semibold text-ink disabled:opacity-50">{checkingAll ? "Checking…" : "Check all timing"}</button>
        </div>
      </div>

      {L.status === "translating" && <p className="m-0 text-sm text-mute">Translating…</p>}
      {L.status === "failed" && <p role="alert" className="m-0 text-sm text-pink">This language failed: {L.error}</p>}

      <div className="flex flex-col gap-2.5">
        {L.lines.map((l, idx) => {
          const c = checks[`${langId}-${l.id}`];
          const check = c && c.text === l.text ? c : null;
          const isEd = editing === l.id;
          const busy = pending[l.id] || locked;
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-4 rounded-[18px] px-4 py-3.5 transition-colors"
              style={{ border: `1px solid ${l.approved ? "rgba(110,231,183,0.4)" : "#1E2232"}`, background: l.approved ? "rgba(110,231,183,0.05)" : "#0C0E15" }}>
              <button type="button" aria-label={`Play line ${idx + 1} from ${fmt(l.start)}`} onClick={() => seek(l.start)}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-0 bg-[#1E2232] p-0 text-ink">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
              </button>

              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                  <span className="h-2 w-2 rounded-full" style={{ background: DOTS[speakers.indexOf(l.speaker) % DOTS.length] }} />
                  Speaker {speakers.indexOf(l.speaker) + 1} · <span className="font-mono">{fmt(l.start)}–{fmt(l.end)}</span>
                  {l.edited && <span className="rounded-full bg-lav/15 px-2 py-0.5 text-[11px] font-bold text-lav">edited</span>}
                  {l.shortened && <span className="rounded-full bg-peach/15 px-2 py-0.5 text-[11px] font-bold text-peach">shortened by AI</span>}
                </div>
                <div className="text-[13px] text-[#8A93A8]">{l.source_text}</div>
                {isEd ? (
                  <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit translation for line ${idx + 1}`}
                    className="box-border w-full resize-none rounded-xl border border-lav bg-well px-3 py-2.5 text-[17px] leading-snug font-semibold text-ink" />
                ) : (
                  <div className="text-lg leading-snug font-semibold">{l.text}</div>
                )}
                <div className="flex flex-wrap items-center gap-2"><Chip check={check} /></div>
                {check?.suggestion && !isEd && (
                  <div className="flex flex-col gap-2 rounded-xl border border-pink/30 bg-pink/5 p-3">
                    <span className="text-xs font-bold text-pink">Shorter suggestion (not applied)</span>
                    <span className="text-[15px] font-semibold">{check.suggestion}</span>
                    <div><button type="button" disabled={busy} onClick={() => run(l.id, () => actions.edit(l.id, check.suggestion))}
                      className="h-8 rounded-full border-0 bg-pink px-4 text-[13px] font-bold text-[#1B0B17]">Use this version</button></div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {isEd ? (
                  <>
                    <button type="button" disabled={busy || !draft.trim()} onClick={() => save(l.id)} className="h-[38px] rounded-full border-0 bg-lav px-4 text-[13px] font-bold text-[#0B0A18] disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className="h-[38px] rounded-full border border-[#2C3247] bg-transparent px-4 text-[13px] font-semibold text-ink">Cancel</button>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={busy} onClick={() => { setEditing(l.id); setDraft(l.text); }} className="h-[38px] rounded-full border border-[#2C3247] bg-transparent px-4 text-[13px] font-semibold text-ink disabled:opacity-50">Edit</button>
                    <button type="button" disabled={busy} onClick={() => run(l.id, () => actions.check(l.id))} className="h-[38px] rounded-full border border-[#2C3247] bg-transparent px-4 text-[13px] font-semibold text-ink disabled:opacity-50">
                      {pending[l.id] ? "Checking…" : "Check timing"}
                    </button>
                    <button type="button" aria-pressed={l.approved} disabled={busy} onClick={() => run(l.id, () => actions.approve(l.id, !l.approved))}
                      className="inline-flex h-[38px] items-center gap-1.5 rounded-full px-4 text-[13px] font-bold disabled:opacity-50"
                      style={{ border: `1px solid ${l.approved ? "#6EE7B7" : "#A99BFF"}`, background: l.approved ? "#6EE7B7" : "transparent", color: l.approved ? "#0B1A12" : "#A99BFF" }}>
                      {l.approved ? "✓ Approved" : "Approve"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-sm text-mute">
          {L.status === "rendering" ? "Rendering the dub… this takes about 20–60 seconds."
            : L.dubbed ? "Dub is ready. Switch to “Dubbed” above to watch it."
            : allOk ? "All lines approved. Ready to render." : `Approve all ${total} line(s) to unlock rendering.`}
        </span>
        <button type="button" disabled={!allOk || locked || L.dubbed} onClick={actions.render}
          className="h-12 rounded-full border-0 px-7 text-sm font-bold"
          style={{ background: allOk && !L.dubbed && !locked ? "#FFA6E7" : "#232738", color: allOk && !L.dubbed && !locked ? "#1B0B17" : "#6B7390" }}>
          {L.status === "rendering" ? "Rendering…" : L.dubbed ? "Dub rendered ✓" : "Render dubbed video"}
        </button>
      </div>
    </section>
  );
}
