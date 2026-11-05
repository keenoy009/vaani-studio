import { useRef, useState } from "react";
import { LANGS, SOURCES } from "../api.js";

const OK = /\.(mp4|mov|mkv|webm|m4v)$/i;

export default function Upload({ onUpload, onSample }) {
  const [file, setFile] = useState(null);
  const [source, setSource] = useState("hi");
  const [targets, setTargets] = useState(["kn"]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef(null);

  const pick = (f) => {
    if (!f) return;
    if (!OK.test(f.name)) { setMsg("Please choose a video file: MP4, MOV, MKV, WEBM or M4V."); return; }
    setMsg(""); setFile(f);
  };
  const toggle = (id) => setTargets((t) => (t.includes(id) ? (t.length > 1 ? t.filter((x) => x !== id) : t) : [...t, id]));
  const go = async () => { setBusy(true); await onUpload(file, source, targets); setBusy(false); };

  return (
    <section className="rounded-[28px] border border-line bg-panel p-3.5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className="flex min-h-[520px] flex-col items-center justify-center gap-[18px] rounded-[22px] bg-well p-8 text-center"
        style={{ border: `1.5px dashed ${drag ? "#A99BFF" : "#343A55"}` }}>
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-3xl border border-lav/30 bg-lav/15">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#A99BFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[30px] font-extrabold tracking-[-0.02em]">{file ? file.name : "Drop your video here"}</span>
          <span className="text-sm text-mute">
            {file ? `${(file.size / 1048576).toFixed(1)} MB` : "Hindi or English · up to about 5 minutes · MP4, MOV, MKV, WEBM"}
          </span>
        </div>

        <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => pick(e.target.files[0])} />
        <button type="button" onClick={() => input.current.click()} className="h-12 rounded-full border border-[#343A55] bg-transparent px-6 text-sm font-semibold text-ink">
          {file ? "Choose a different file" : "Browse files"}
        </button>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-[13px] text-mute">Spoken language</span>
          {Object.entries(SOURCES).map(([id, name]) => (
            <button key={id} type="button" aria-pressed={source === id} onClick={() => setSource(id)}
              className="h-[34px] rounded-full px-4 text-[13px] font-semibold"
              style={{ border: `1px solid ${source === id ? "#A99BFF" : "#262B40"}`, background: source === id ? "rgba(169,155,255,0.16)" : "#171A25", color: "#F1F3FA" }}>{name}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-[13px] text-mute">Dub into</span>
          {LANGS.map((l) => {
            const on = targets.includes(l.id);
            return (
              <button key={l.id} type="button" aria-pressed={on} onClick={() => toggle(l.id)}
                className="h-[34px] rounded-full px-4 text-[13px] font-semibold"
                style={{ border: `1px solid ${on ? "#FFA6E7" : "#262B40"}`, background: on ? "rgba(255,166,231,0.14)" : "#171A25", color: "#F1F3FA" }}>{l.native} · {l.name}</button>
            );
          })}
        </div>

        {msg && <p role="alert" className="m-0 text-sm text-pink">{msg}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" disabled={!file || busy} onClick={go}
            className="h-12 rounded-full border-0 px-8 text-sm font-bold"
            style={{ background: file && !busy ? "#A99BFF" : "#232738", color: file && !busy ? "#0B0A18" : "#6B7390" }}>
            {busy ? "Uploading…" : "Start dubbing"}
          </button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSample(); setBusy(false); }}
            title="A made-up two-speaker Hindi clip (about 12 s) voiced by Timbre. No real person's voice."
            className="h-12 rounded-full border border-[#343A55] bg-transparent px-6 text-sm font-semibold text-ink disabled:opacity-50">Use sample video</button>
        </div>
      </div>
    </section>
  );
}
