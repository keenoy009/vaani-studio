import { useEffect, useRef, useState } from "react";
import { LANGS, SOURCES, fmt } from "../api.js";

const OK = /\.(mp4|mov|mkv|webm|m4v)$/i;
const MAX_SECONDS = 290; // the server rejects clips longer than this (Gnani direct-upload limit)
const MAX_MB = 200;

function Icon({ d, size = 20, sw = 1.9 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

const HOW = [
  ["Transcribe", "Finds every spoken line and who said it.", "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"],
  ["Translate", "Turns each line into natural spoken language.", "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 0 0 18"],
  ["Voice", "Speaks it with a clear voice for each speaker.", "M4 12h2M8 8v8M12 4v16M16 8v8M20 12h-2"],
  ["Mix", "Fits the timing and builds your finished video.", "M4 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4zM18 10l4-2v8l-4-2"],
];

export default function Upload({ onUpload, onSample }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [seconds, setSeconds] = useState(null);
  const [source, setSource] = useState("hi");
  const [targets, setTargets] = useState(["kn"]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (!file) { setPreview(null); setSeconds(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f) => {
    if (!f) return;
    if (!OK.test(f.name)) { setMsg("That file type isn't supported. Please choose an MP4, MOV, MKV, WEBM or M4V video."); return; }
    setMsg(""); setSeconds(null); setFile(f);
  };
  // A video can't be dubbed into the language it is already spoken in.
  const pickSource = (id) => {
    setSource(id);
    setTargets((t) => { const rest = t.filter((x) => x !== id); return rest.length ? rest : [LANGS.find((l) => l.id !== id).id]; });
  };
  const toggle = (id) => setTargets((t) => (t.includes(id) ? (t.length > 1 ? t.filter((x) => x !== id) : t) : [...t, id]));
  const options = LANGS.filter((l) => l.id !== source);
  const stable = options.filter((l) => !l.experimental); // "Select all" skips experimental languages
  const allOn = stable.every((l) => targets.includes(l.id));

  const tooLong = seconds != null && seconds > MAX_SECONDS;
  const tooBig = file && file.size > MAX_MB * 1048576;
  const canStart = !!file && !tooLong && !tooBig && !busy && targets.length > 0;
  const go = async () => { setBusy(true); await onUpload(file, source, targets); setBusy(false); };
  const names = targets.map((id) => LANGS.find((l) => l.id === id)?.name).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 px-1">
        <span className="text-xs font-bold tracking-[0.16em] text-lav">NEW DUB</span>
        <h2 className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.03em] max-sm:text-[24px]">One video, every language your audience speaks</h2>
        <p className="m-0 max-w-[640px] text-[15px] leading-relaxed text-mute">Upload a video, choose the languages, and get it back dubbed, with a separate voice for each speaker.</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start gap-6 max-xl:grid-cols-1">
        {/* ---------- left: video ---------- */}
        <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-3.5">
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              className="relative flex min-h-[440px] flex-col items-center justify-center gap-6 overflow-hidden rounded-[22px] p-8 text-center transition-colors"
              style={{ border: `1.5px dashed ${drag ? "#FFA6E7" : "#343A55"}`, background: `radial-gradient(520px 280px at 50% 0%, ${drag ? "rgba(255,166,231,0.22)" : "rgba(139,123,255,0.22)"}, transparent 70%), radial-gradient(420px 240px at 100% 100%, rgba(255,166,231,0.10), transparent 70%), #0C0E15` }}>
              <div className="relative">
                <span className="pulse absolute inset-0 rounded-[30px]" />
                <span className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[30px] bg-gradient-to-br from-[#8B7BFF] to-[#FFA6E7] text-[#0B0A18] shadow-[0_12px_40px_rgba(139,123,255,0.45)]">
                  <Icon d="M12 16V4M7 9l5-5 5 5M5 20h14" size={36} sw={2.3} />
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[28px] font-extrabold tracking-[-0.02em] max-sm:text-[22px]">{drag ? "Drop it to upload" : "Drag your video here"}</span>
                <span className="text-sm text-mute">or choose a file from your computer</span>
              </div>
              <button type="button" onClick={() => input.current.click()} className="h-[52px] rounded-full border-0 bg-ink px-8 text-sm font-bold text-[#0B0A18]">Choose a video</button>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-mute">
                {["MP4", "MOV", "MKV", "WEBM"].map((f) => <span key={f} className="rounded-full border border-[#262B40] bg-[#12141D] px-3 py-1 font-mono font-medium">{f}</span>)}
                <span>· up to 5 minutes · {MAX_MB} MB</span>
              </div>
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-[22px] bg-black">
                <video src={`${preview}#t=0.5`} muted playsInline controls preload="metadata" className="block aspect-video w-full object-contain"
                  onLoadedMetadata={(e) => setSeconds(e.currentTarget.duration)} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="truncate text-base font-bold" title={file.name}>{file.name}</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-[#171A25] px-2.5 py-1 font-mono text-mute">{(file.size / 1048576).toFixed(1)} MB</span>
                    <span className="rounded-full bg-[#171A25] px-2.5 py-1 font-mono text-mute">{seconds != null ? fmt(seconds) : "…"}</span>
                  </div>
                </div>
                <button type="button" onClick={() => input.current.click()} className="h-10 rounded-full border border-[#2C3247] bg-transparent px-5 text-[13px] font-bold text-ink">Change video</button>
              </div>
              {tooLong && <p role="alert" className="m-0 mx-2 mb-1 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">This video is {fmt(seconds)} long. The limit is about 5 minutes. Please trim it and try again.</p>}
              {tooBig && <p role="alert" className="m-0 mx-2 mb-1 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">This file is {(file.size / 1048576).toFixed(0)} MB. The limit is {MAX_MB} MB.</p>}
            </>
          )}
          <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => { pick(e.target.files[0]); e.target.value = ""; }} />
          {msg && <p role="alert" className="m-0 mx-2 mb-1 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">{msg}</p>}
        </section>

        {/* ---------- right: options ---------- */}
        <section className="flex flex-col gap-6 rounded-[28px] border border-line bg-panel p-6">
          <div className="flex flex-col gap-2.5">
            <label htmlFor="src" className="text-sm font-bold">Spoken in</label>
            <div className="relative">
              <select id="src" value={source} onChange={(e) => pickSource(e.target.value)}
                className="h-12 w-full appearance-none rounded-2xl border border-[#2C3247] bg-well px-4 pr-10 text-[15px] font-semibold text-ink">
                {Object.entries(SOURCES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-mute"><Icon d="M6 9l6 6 6-6" size={16} /></span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Dub into <span className="font-normal text-mute">· {targets.length} selected</span></span>
              <button type="button" onClick={() => setTargets(allOn ? [stable[0].id] : stable.map((l) => l.id))} className="border-0 bg-transparent p-0 text-xs font-bold text-lav">{allOn ? "Clear" : "Select all"}</button>
            </div>
            <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-2">
              {options.map((l) => {
                const on = targets.includes(l.id);
                return (
                  <button key={l.id} type="button" aria-pressed={on} onClick={() => toggle(l.id)}
                    className="relative flex flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left text-ink"
                    style={{ border: `1px solid ${on ? "#A99BFF" : "#262B40"}`, background: on ? "linear-gradient(145deg, rgba(139,123,255,0.22), rgba(255,166,231,0.10))" : "#12141D" }}>
                    <span className="text-[17px] leading-snug font-bold">{l.native}</span>
                    <span className="text-[11px] text-mute">{l.name}{l.experimental && <span className="ml-1.5 rounded-full bg-[#2A2236] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-peach">EXPERIMENTAL</span>}</span>
                    {on && <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-lav text-[#0B0A18]"><Icon d="M5 12.5l4.5 4.5L19 7.5" size={10} sw={3.4} /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-well px-4 py-3 text-[13px]">
              <span className="text-mute">Summary</span>
              <span className="truncate text-right font-semibold">{SOURCES[source]} <span className="text-mute">→</span> {names}</span>
            </div>
            <button type="button" disabled={!canStart} onClick={go}
              className="flex h-14 items-center justify-center gap-2 rounded-full border-0 text-[15px] font-extrabold"
              style={{ background: canStart ? "linear-gradient(90deg,#A99BFF,#FFA6E7)" : "#232738", color: canStart ? "#0B0A18" : "#6B7390", boxShadow: canStart ? "0 10px 30px rgba(169,155,255,0.30)" : "none" }}>
              {busy ? "Uploading…" : file ? "Start dubbing" : "Choose a video to start"}
              {!busy && file && <Icon d="M5 12h14M13 6l6 6-6 6" size={18} sw={2.4} />}
            </button>
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSample(); setBusy(false); }}
              title="A made-up two-speaker Hindi clip (about 12 s) voiced by Timbre. No real person's voice."
              className="h-10 border-0 bg-transparent text-[13px] font-bold text-mute hover:text-ink disabled:opacity-50">No video handy? Try a sample clip</button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-sm:grid-cols-1">
        {HOW.map(([title, text, d], i) => (
          <div key={title} className="flex items-start gap-3.5 rounded-[22px] border border-line bg-panel p-4">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-lav/15 text-lav"><Icon d={d} /></span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold"><span className="mr-1.5 font-mono text-xs text-mute">0{i + 1}</span>{title}</span>
              <span className="text-xs leading-relaxed text-mute">{text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
