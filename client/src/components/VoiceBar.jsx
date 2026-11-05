import { useEffect, useState } from "react";
import { api } from "../api.js";

// Choose the dubbed voice for each speaker, right on the studio page. Changing a voice clears the
// rendered dub on the server, so a "Re-render" button appears to apply it.
export default function VoiceBar({ job, L, onChanged, onRender, onError }) {
  const [voices, setVoices] = useState([]);
  const [mine, setMine] = useState([]);
  useEffect(() => { api.voices().then(setVoices).catch(() => {}); }, []);
  useEffect(() => { api.jobVoices(job.id).then(setMine).catch(() => {}); }, [job.id]);

  const working = L.status === "translating" || L.status === "rendering";
  const stale = !L.dubbed && L.status === "review";
  const change = async (speaker, voice) => {
    try { setMine(await api.setVoices(job.id, { [speaker]: voice })); await onChanged(); } catch (e) { onError(e.message); }
  };
  if (mine.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-well p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-bold">Dubbed voice</span>
        {stale && <button type="button" onClick={onRender} className="h-9 rounded-full border-0 bg-pink px-4 text-[13px] font-bold text-[#1B0B17]">Apply &amp; re-render</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        {mine.map((m) => (
          <label key={m.speaker} className="flex flex-col gap-1.5 text-xs text-mute">{m.label}
            <select value={m.voice} disabled={working} onChange={(e) => change(m.speaker, e.target.value)}
              className="h-10 rounded-full border border-[#2C3247] bg-panel px-4 text-sm font-semibold text-ink disabled:opacity-50">
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} · {v.gender} · {v.persona}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
