import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, fmt } from "../api.js";

const BARS = [10, 18, 26, 14, 30, 20, 12, 28, 22, 16, 30, 12, 24, 14];
const ORB = [
  { bg: "linear-gradient(145deg,#7C6CFF,#C8BFFF)", color: "#A99BFF", glow: "0 0 0 6px rgba(169,155,255,0.22), 0 0 50px rgba(169,155,255,0.45)" },
  { bg: "linear-gradient(145deg,#FF7ED8,#FFC2EE)", color: "#FFA6E7", glow: "0 0 0 6px rgba(255,166,231,0.20), 0 0 50px rgba(255,166,231,0.40)" },
  { bg: "linear-gradient(145deg,#FF9A63,#FFD0B3)", color: "#FFB68F", glow: "0 0 0 6px rgba(255,182,143,0.20), 0 0 50px rgba(255,182,143,0.40)" },
  { bg: "linear-gradient(145deg,#38D9A0,#B5F5DC)", color: "#6EE7B7", glow: "0 0 0 6px rgba(110,231,183,0.20), 0 0 50px rgba(110,231,183,0.40)" },
];

export default function Player({ ref, job, langId, L, mode, setMode, dubVer, onTime }) {
  const video = useRef(null);
  const last = useRef({ t: 0, playing: false }); // carried across the Original <-> Dubbed switch
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(job.duration || 0);

  const dubOk = L.dubbed;
  const dub = mode === "dub" && dubOk;
  const src = dub ? api.dubUrl(job.id, langId, dubVer) : api.originalUrl(job.id);

  useImperativeHandle(ref, () => ({
    seek(time) { const v = video.current; if (v) { v.currentTime = time; v.play().catch(() => {}); } },
  }));

  // New source loaded: jump back to where we were, resume if we were playing.
  const onLoaded = () => {
    const v = video.current;
    setDur(v.duration || job.duration || 0);
    v.currentTime = Math.min(last.current.t, v.duration || last.current.t);
    if (last.current.playing) v.play().catch(() => {});
  };

  useEffect(() => { setT(0); }, [job.id]);

  const speakers = [...new Set(job.segments.map((s) => s.speaker))].sort((a, b) => a - b);
  const active = L.lines.find((l) => t >= l.start && t <= l.end);
  const subtitle = active ? (dub ? active.text : active.source_text) : "";
  const label = dub ? `${job.source === "hi" ? "Hindi" : "English"} → ${langId.toUpperCase()}` : "Original";

  return (
    <>
      <div className="relative h-[380px] overflow-hidden rounded-[22px] bg-[#12142A]"
        style={{ backgroundImage: "radial-gradient(520px 300px at 15% 0%, rgba(139,123,255,0.42), transparent 62%), radial-gradient(520px 320px at 92% 100%, rgba(255,166,231,0.30), transparent 62%)" }}>
        <video key={src} ref={video} src={src} playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={onLoaded}
          onTimeUpdate={(e) => { last.current.t = e.currentTarget.currentTime; setT(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime); }}
          onPlay={() => { last.current.playing = true; setPlaying(true); }}
          onPause={() => { last.current.playing = false; setPlaying(false); }}
          onEnded={() => { last.current = { t: 0, playing: false }; setPlaying(false); }} />

        <div className="absolute top-4 right-4 left-4 z-[2] flex flex-wrap items-center justify-between gap-2.5">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-[#07080C]/60 px-4 text-[13px] font-semibold">
            <span className="h-2 w-2 rounded-full bg-pink" />{label}
          </span>
          <div role="group" aria-label="Playback version" className="flex rounded-full border border-white/10 bg-[#07080C]/60 p-1">
            {[["orig", "Original"], ["dub", "Dubbed"]].map(([id, text]) => {
              const on = (id === "dub") === dub;
              const disabled = id === "dub" && !dubOk;
              return (
                <button key={id} type="button" aria-pressed={on} disabled={disabled} title={disabled ? "Approve all lines and render the dub first" : ""}
                  onClick={() => { video.current && (last.current.t = video.current.currentTime); setMode(id); }}
                  className="h-8 rounded-full border-0 px-4 text-[13px] font-semibold"
                  style={{ background: on ? "#F1F3FA" : "transparent", color: on ? "#0B0A18" : disabled ? "#5A6178" : "#C9CFE0" }}>{text}</button>
              );
            })}
          </div>
        </div>

        <div className="absolute right-4 bottom-[92px] left-4 z-[2] flex items-end justify-center gap-8">
          {speakers.map((sp, i) => {
            const o = ORB[i % ORB.length];
            const on = active?.speaker === sp;
            return (
              <div key={sp} className="flex flex-col items-center gap-1.5 transition-all duration-300" style={{ transform: `scale(${on ? 1 : 0.8})`, opacity: on ? 1 : 0.5 }}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full text-base font-extrabold text-[#0B0A18]" style={{ background: o.bg, boxShadow: on ? o.glow : "none" }}>S{i + 1}</div>
                <div className={`wv ${on && playing ? "on" : ""}`} style={{ color: o.color }} aria-hidden="true">
                  {BARS.map((h, j) => <i key={j} style={{ height: h * 0.7, animationDelay: `${(j * 0.07).toFixed(2)}s` }} />)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute right-4 bottom-4 left-4 z-[2] flex min-h-[58px] items-center justify-center rounded-[18px] border border-white/10 bg-[#07080C]/70 px-5 py-3 text-center text-xl leading-snug font-semibold tracking-[-0.01em]" aria-live="polite">
          {subtitle || <span className="text-sm font-normal text-mute">No speech at this moment</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-1.5">
        <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => { const v = video.current; v.paused ? v.play() : v.pause(); }}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-0 bg-ink p-0 text-[#0B0A18]">
          {playing
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>}
        </button>
        <span className="font-mono text-sm text-mute"><span className="text-ink">{fmt(t)}</span> / {fmt(dur)}</span>
        <input type="range" aria-label="Seek" min={0} max={dur || 1} step={0.1} value={Math.min(t, dur || 1)} className="min-w-[120px] flex-1 accent-[#A99BFF]"
          onChange={(e) => { const v = video.current; v.currentTime = +e.target.value; setT(+e.target.value); }} />
        {speakers.length > 1 && (
          <span className="inline-flex h-[34px] items-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-3.5 text-xs font-semibold text-mint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {dub ? "Each speaker keeps their own voice" : `${speakers.length} speakers detected`}
          </span>
        )}
      </div>
    </>
  );
}
