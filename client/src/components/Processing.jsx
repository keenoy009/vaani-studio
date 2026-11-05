import { useEffect, useState } from "react";
import { fmt } from "../api.js";

const STEPS = [
  { id: "audio", name: "Extract audio", text: "Pulling the audio out of your video" },
  { id: "transcribe", name: "Transcribe", text: "Listening and separating speakers" },
  { id: "translate", name: "Translate", text: "Translating each line" },
  { id: "voice", name: "Voice & mix", text: "Recording the dubbed voices and mixing" },
];

export default function Processing({ job }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);
  const cur = Math.max(0, STEPS.findIndex((s) => s.id === job.stage));
  const elapsed = (now - new Date(job.createdAt).getTime()) / 1000;

  return (
    <section className="rounded-[28px] border border-line bg-panel p-3.5">
      <div className="flex min-h-[520px] flex-col gap-7 rounded-[22px] bg-well p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-lav">Dubbing in progress</span>
            <span className="text-[26px] font-extrabold tracking-[-0.02em]">{STEPS[cur].text}</span>
          </div>
          <span className="font-mono text-[56px] leading-none font-medium tracking-[-0.04em]" aria-label="Elapsed time">{fmt(elapsed)}</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5 max-sm:grid-cols-1">
          {STEPS.map((s, i) => {
            const done = i < cur, active = i === cur;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-[#131622] px-4 py-3.5" style={{ border: `1px solid ${active ? "#A99BFF" : "#1E2232"}` }}>
                <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full ${active ? "pulse" : ""}`}
                  style={{ background: done ? "#6EE7B7" : "transparent", border: `2px solid ${done ? "#6EE7B7" : active ? "#A99BFF" : "#343A55"}` }}>
                  {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0B0A18" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </span>
                <span className="text-sm font-semibold" style={{ color: done || active ? "#F1F3FA" : "#6B7390" }}>{s.name}</span>
              </div>
            );
          })}
        </div>
        <p className="m-0 text-sm text-mute">Usually about 1–2 minutes for a short clip. You can leave this tab open; the page updates by itself.</p>
      </div>
    </section>
  );
}
