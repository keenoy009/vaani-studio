import { useState } from "react";

// Timing match: for every line, the time slot in the original (lavender) vs how long the dubbed
// speech takes (pink). Dubbed lengths are REAL measurements taken when the dub was rendered.
export default function Timing({ job, L, t, onSeek }) {
  const [tab, setTab] = useState("both");
  const total = job.duration || Math.max(...L.lines.map((l) => l.end), 1);
  const spokenOf = (l) => (L.dubbed && l.fit_seconds ? l.fit_seconds : null);
  const measured = L.lines.filter((l) => spokenOf(l) != null).length;
  const pct = (s) => `${Math.min(100, (s / total) * 100)}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * total));
  const showO = tab !== "dub", showD = tab !== "orig";

  return (
    <div className="flex flex-col gap-2.5 px-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-mute">
          <span className="text-[15px] font-bold text-ink">Timing match</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lav" />Original slot</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pink" />Dubbed speech</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-peach" />Overruns</span>
        </div>
        <div role="tablist" aria-label="Chart view" className="flex gap-[18px]">
          {[["both", "Both"], ["orig", "Original"], ["dub", "Dubbed"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className="border-0 bg-transparent px-0 py-1 text-[13px] font-semibold"
              style={{ borderBottom: `2px solid ${tab === id ? "#A99BFF" : "transparent"}`, color: tab === id ? "#F1F3FA" : "#8A93A8" }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="relative h-[110px] overflow-hidden rounded-2xl bg-well" role="group" aria-label={`Timing chart: ${measured} of ${L.lines.length} lines measured`}>
        {[25, 50, 75].map((p) => <div key={p} className="absolute top-0 bottom-0 w-px bg-white/[0.07]" style={{ left: `${p}%` }} />)}
        {L.lines.map((l) => {
          const sp = spokenOf(l);
          const over = sp != null && sp > l.end - l.start + 0.3;
          return (
            <div key={l.id}>
              {showO && <div className="absolute h-[22px] rounded-md bg-lav/80" style={{ top: tab === "both" ? 22 : 44, left: pct(l.start), width: pct(l.end - l.start) }} title={`Slot ${(l.end - l.start).toFixed(1)}s`} />}
              {showD && sp != null && <div className="absolute h-[22px] rounded-md" style={{ top: tab === "both" ? 56 : 44, left: pct(l.start), width: pct(sp), background: over ? "#FFB68F" : "#FFA6E7" }} title={`Speech ${sp.toFixed(1)}s`} />}
            </div>
          );
        })}
        {showD && measured === 0 && <span className="absolute right-3 bottom-2 left-3 text-center text-xs text-mute">The dubbed bars appear once the dub is rendered.</span>}
        <div className="absolute top-0 bottom-0 w-0.5 -translate-x-px rounded-sm bg-ink" style={{ left: pct(t) }} />
        {[0, 1, 2, 3].map((i) => (
          <button key={i} type="button" aria-label={`Jump to ${Math.round((i * total) / 4)} seconds`} onClick={() => onSeek((i * total) / 4)}
            className="absolute top-0 bottom-0 w-1/4 border-0 bg-transparent p-0 hover:bg-white/5" style={{ left: `${i * 25}%` }} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-[#8A93A8]">{ticks.map((s, i) => <span key={i}>{s}s</span>)}</div>
    </div>
  );
}
