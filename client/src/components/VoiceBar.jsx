import { useEffect, useState } from "react";
import { api } from "../api.js";
import VoiceSelect from "./VoiceSelect.jsx";

// Choose the dubbed voice for each speaker, right on the studio page. Changing a voice clears the
// rendered dub on the server, so a "Re-render" button appears to apply it.
export default function VoiceBar({ job, L, onChanged, onRender, onError }) {
  const [voices, setVoices] = useState([]);
  const [mine, setMine] = useState([]);
  useEffect(() => { api.voices().then(setVoices).catch(() => {}); }, []);
  useEffect(() => { api.jobVoices(job.id).then(setMine).catch(() => {}); }, [job.id]);

  const working = L.status === "translating" || L.status === "rendering";
  const stale = !L.dubbed && L.status === "review";
  const change = async (speaker, voice, consent) => {
    try { setMine(await api.setVoices(job.id, consent ? { [speaker]: voice, cloneConsent: true } : { [speaker]: voice })); await onChanged(); }
    catch (e) { onError(e.message); }
  };
  if (mine.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-well p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-bold">Dubbed voice</span>
        {stale && <button type="button" onClick={onRender} className="h-9 rounded-full border-0 bg-pink px-4 text-[13px] font-bold text-[#1B0B17]">Apply &amp; re-render</button>}
      </div>
      <div className="grid grid-cols-2 items-start gap-3 max-sm:grid-cols-1">
        {mine.map((m) => (
          <div key={m.speaker} className="flex flex-col gap-1.5">
            <span className="text-xs text-mute">{m.label}</span>
            <VoiceSelect m={m} voices={voices} disabled={working} onChange={change} label={`Voice for ${m.label}`} />
          </div>
        ))}
      </div>
      {(L.cloneNotes ?? []).map((n, i) => <p key={i} role="status" className="m-0 text-xs leading-relaxed text-peach">{n}</p>)}
    </div>
  );
}
