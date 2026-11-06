import { useEffect, useState } from "react";
import { api } from "../api.js";

const VIEWER_COLORS = ["#A99BFF", "#FFA6E7", "#FFB68F", "#6EE7B7"];
const CHIP = { Done: ["rgba(110,231,183,0.14)", "#6EE7B7"], Dubbing: ["rgba(169,155,255,0.16)", "#A99BFF"], Waiting: ["#232738", "#9AA3B8"], Failed: ["rgba(255,166,231,0.14)", "#FFA6E7"] };

// Reads the bot's status, groups and viewers from GET /api/telegram (kept up to date by server/bot.mjs):
//   { online, botUsername, groups: [{id, name, members}], viewers: [{name, what, state: "Waiting"|"Dubbing"|"Done"|"Failed"}] }
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

export function Groups({ tg }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-bold text-mute">Groups the bot is in</span>
      {tg.groups.length === 0 && (
        <p className="m-0 rounded-2xl border border-dashed border-[#343A55] p-3.5 text-sm leading-relaxed text-[#6B7390]">
          The bot is not in any group yet.{" "}
          {tg.botUsername && <a className="font-bold text-lav" href={`https://t.me/${tg.botUsername}?startgroup=true`} target="_blank" rel="noreferrer">Add @{tg.botUsername} to a group</a>}
        </p>
      )}
      {tg.groups.map((g, i) => (
        <div key={g.id} className="flex items-center gap-3 rounded-2xl border border-line bg-well px-3.5 py-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-extrabold text-[#14131F]" style={{ background: VIEWER_COLORS[i % 4] }}>{g.name.slice(0, 2).toUpperCase()}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-bold">{g.name}</span>
            <span className="text-xs text-mute">{g.members ? `${g.members} members` : "Group"}</span>
          </div>
        </div>
      ))}
    </div>
  );
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

// The Studio's Telegram card: who is using the bot and where it lives. (Sending a dub happens in Telegram itself.)
export default function Telegram({ tg }) {
  return (
    <section className="flex flex-col gap-5 rounded-[28px] border border-line bg-panel p-[22px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xl font-extrabold tracking-[-0.02em]">Telegram</span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold"
          style={{ background: tg.online ? "rgba(110,231,183,0.10)" : "#232738", color: tg.online ? "#6EE7B7" : "#9AA3B8" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tg.online ? "#6EE7B7" : "#6B7390" }} />{tg.online ? "Bot online" : "Bot offline"}
        </span>
      </div>
      <Groups tg={tg} />
      <Viewers viewers={tg.viewers} />
    </section>
  );
}
