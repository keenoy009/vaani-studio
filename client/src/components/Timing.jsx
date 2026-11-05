// Timing match: for every line, the time slot in the original (lavender) vs how long the dubbed
// speech takes (pink). Dubbed lengths are REAL measurements: from "Check timing" or from a finished render.
export default function Timing({ job, langId, L, checks }) {
  const total = job.duration || Math.max(...L.lines.map((l) => l.end), 1);
  const spokenOf = (l) => {
    if (L.dubbed && l.fit_seconds) return l.fit_seconds;
    const c = checks[`${langId}-${l.id}`];
    return c && c.text === l.text ? c.spoken : null;
  };
  const measured = L.lines.filter((l) => spokenOf(l) != null).length;
  const pct = (s) => `${Math.min(100, (s / total) * 100)}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * total));

  return (
    <div className="flex flex-col gap-2.5 px-1.5">
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-mute">
        <span className="text-[15px] font-bold text-ink">Timing match</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lav" />Original slot</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pink" />Dubbed speech</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-peach" />Overruns the slot</span>
      </div>
      <div className="relative h-[110px] overflow-hidden rounded-2xl bg-well" role="img"
        aria-label={`Timing chart: ${measured} of ${L.lines.length} lines measured`}>
        {[25, 50, 75].map((p) => <div key={p} className="absolute top-0 bottom-0 w-px bg-white/[0.07]" style={{ left: `${p}%` }} />)}
        {L.lines.map((l) => {
          const sp = spokenOf(l);
          const over = sp != null && sp > l.end - l.start + 0.3;
          return (
            <div key={l.id}>
              <div className="absolute top-[22px] h-[22px] rounded-md bg-lav/80" style={{ left: pct(l.start), width: pct(l.end - l.start) }} title={`Slot ${(l.end - l.start).toFixed(1)}s`} />
              {sp != null && <div className="absolute top-[56px] h-[22px] rounded-md" style={{ left: pct(l.start), width: pct(sp), background: over ? "#FFB68F" : "#FFA6E7" }} title={`Speech ${sp.toFixed(1)}s`} />}
            </div>
          );
        })}
        {measured === 0 && <span className="absolute right-3 bottom-2 left-3 text-center text-xs text-mute">Press “Check timing” on a line to measure how long the dubbed speech really is.</span>}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-[#8A93A8]">{ticks.map((s, i) => <span key={i}>{s}s</span>)}</div>
    </div>
  );
}
