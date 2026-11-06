import { useState } from "react";

// Voice choice for ONE speaker: "Match original speaker" (voice cloning) or a ready-made studio voice.
// Cloning copies a real person's voice, so the first time it is picked we ask the user to confirm they have permission.
export default function VoiceSelect({ m, voices, disabled, onChange, label }) {
  const [asking, setAsking] = useState(false);
  const pick = (value) => {
    if (value === "clone" && !m.consent) { setAsking(true); return; } // wait for the confirmation
    setAsking(false);
    onChange(m.speaker, value, false);
  };
  return (
    <div className="flex flex-col gap-2">
      <select aria-label={label} value={asking ? "clone" : m.voice} disabled={disabled} onChange={(e) => pick(e.target.value)}
        className="h-11 rounded-full border border-[#2C3247] bg-panel px-4 text-sm font-semibold text-ink disabled:opacity-50">
        <option value="clone" disabled={!m.canClone}>
          Match original speaker{m.canClone ? "" : ` (needs 5 s of speech, has ${m.speechSeconds} s)`}
        </option>
        <optgroup label="Studio voices">
          {voices.map((v) => <option key={v.name} value={v.name}>{v.name} · {v.gender}</option>)}
        </optgroup>
      </select>
      {asking && (
        <div role="alertdialog" aria-label="Voice copy permission" className="flex flex-col gap-2.5 rounded-2xl border border-peach/40 bg-peach/10 p-3.5">
          <span className="text-[13px] leading-relaxed text-ink">
            This copies the speaker’s real voice. Only continue if you <b>own this voice or have the speaker’s permission</b>.
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAsking(false); onChange(m.speaker, "clone", true); }}
              className="h-9 flex-1 rounded-full border-0 bg-peach text-[13px] font-bold text-[#1B0B17]">I have permission</button>
            <button type="button" onClick={() => setAsking(false)}
              className="h-9 flex-1 rounded-full border border-[#2C3247] bg-transparent text-[13px] font-bold text-ink">Cancel</button>
          </div>
        </div>
      )}
      {m.voice === "clone" && !asking && <span className="text-[11px] leading-relaxed text-mute">Copied from {m.speechSeconds} s of this speaker’s own speech in the video.</span>}
    </div>
  );
}
