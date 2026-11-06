import { useEffect, useState } from "react";
import { api } from "../api.js";

const VIEWER_COLORS = ["#A99BFF", "#FFA6E7", "#FFB68F", "#6EE7B7"];
const CHIP = { Done: ["rgba(110,231,183,0.14)", "#6EE7B7"], Dubbing: ["rgba(169,155,255,0.16)", "#A99BFF"], Waiting: ["#232738", "#9AA3B8"], Failed: ["rgba(255,166,231,0.14)", "#FFA6E7"] };

// Reads bot status/groups/viewers from GET /api/telegram. The bot (not built yet) will fill them in:
//   { online: bool, groups: [{id, name, members}], viewers: [{name, what, state: "Waiting"|"Dubbing"|"Done"}] }
export function useTelegram() {
  const [tg, setTg] = useState({ online: false, groups: [], viewers: [] });
  useEffect(() => {
    let alive = true;
    const load = () => api.telegram().then((d) => alive && setTg(d)).catch(() => {});
    load();
    const iv = setInterval(load, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return tg;
}

export function Viewers({ viewers }) {
  return (
    <div className="flex flex-col gap-1 pt-1">
      <span className="mb-1.5 text-[13px] font-bold text-mute">Viewers sending videos to the bot</span>
      {viewers.length === 0 && <p className="m-0 py-2 text-sm text-[#6B7390]">Nobody yet. People who send a video to the bot will appear here.</p>}
      {viewers.map((v, i) => {
        const [bg, fg] = CHIP[v.state] || CHIP.Waiting;
        return (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-extrabold text-[#14131F]" style={{ background: VIEWER_COLORS[i % 4] }}>{(v.name || "?")[0].toUpperCase()}</div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-sm font-bold">{v.name}</span><span className="text-[13px] text-mute">{v.what}</span></div>
            <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold" style={{ background: bg, color: fg }}>{v.state}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Telegram({ job, langId, L, tg, onError }) {
  const [group, setGroup] = useState(null);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const g = tg.groups.find((x) => x.id === group) || tg.groups[0];
  const reason = !L.dubbed ? "Locked · dub is not ready"
    : !tg.online ? "Locked · bot is offline"
    : !g ? "Locked · no group linked" : "Send to Telegram";
  const canSend = L.dubbed && tg.online && !!g && !sending;

  const send = async () => {
    setSending(true); setSentMsg("");
    try { await api.send(job.id, langId, g.id); setSentMsg(`Sent to ${g.name} ✓`); } catch (e) { onError(e.message); }
    setSending(false);
  };

  return (
    <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[22px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xl font-extrabold tracking-[-0.02em]">Send on Telegram</span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold"
          style={{ background: tg.online ? "rgba(110,231,183,0.10)" : "#232738", color: tg.online ? "#6EE7B7" : "#9AA3B8" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tg.online ? "#6EE7B7" : "#6B7390" }} />{tg.online ? "Bot online" : "Bot offline"}
        </span>
      </div>

      {g ? (
        <div className="flex items-center gap-3.5 rounded-[20px] bg-lav p-4 text-[#0B0A18]">
          <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-[#0B0A18]/15 text-[15px] font-extrabold">{g.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-extrabold">{g.name}</span>
            <span className="text-[13px] font-medium opacity-80">{g.members ? `${g.members} members · ` : ""}{L && job.langs[langId] ? langId.toUpperCase() : ""}</span>
          </div>
          {tg.groups.length > 1 && (
            <select aria-label="Choose group" value={g.id} onChange={(e) => setGroup(e.target.value)} className="ml-auto rounded-lg border-0 bg-[#0B0A18]/15 px-2 py-1 text-xs font-bold">
              {tg.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-[#343A55] p-4 text-sm leading-relaxed text-mute">
          No group linked yet. {tg.botUsername
            ? <>Add the bot to a Telegram group and it will show up here. <a className="font-bold text-lav" href={`https://t.me/${tg.botUsername}?startgroup=true`} target="_blank" rel="noreferrer">Add @{tg.botUsername} to a group</a></>
            : "Once the bot is added to a Telegram group, it will show up here."}
        </div>
      )}

      <button type="button" disabled={!canSend} onClick={send} className="h-[52px] rounded-full border-0 text-sm font-bold"
        style={{ background: canSend ? "#A99BFF" : "#232738", color: canSend ? "#0B0A18" : "#6B7390" }}>
        {sending ? "Sending…" : canSend ? "Send to Telegram" : `🔒 ${reason}`}
      </button>
      {sentMsg && <p className="m-0 text-sm font-semibold text-mint">{sentMsg}</p>}
      {L.dubbed && <a href={api.downloadUrl(job.id, langId)} className="flex h-12 items-center justify-center rounded-full border border-[#2C3247] text-sm font-bold text-ink no-underline">Download MP4</a>}

      <Viewers viewers={tg.viewers} />
    </section>
  );
}
