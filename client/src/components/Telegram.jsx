import { api } from "../api.js";

// The Telegram bot is not built yet, so "Send" can never be enabled here. The lock logic
// (needs ALL lines approved AND a rendered dub) is already in place for when it is.
const BOT_CONNECTED = false;

export default function Telegram({ job, langId, L }) {
  const total = L.lines.length;
  const approved = L.lines.filter((l) => l.approved).length;
  const allOk = total > 0 && approved === total;
  const reason = !allOk ? `Locked · ${approved} of ${total} lines approved` : !L.dubbed ? "Locked · render the dub first" : !BOT_CONNECTED ? "Bot not connected yet" : "Send to Telegram";
  const canSend = allOk && L.dubbed && BOT_CONNECTED;

  return (
    <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[22px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xl font-extrabold tracking-[-0.02em]">Send on Telegram</span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#232738] px-3 text-xs font-bold text-mute"><span className="h-1.5 w-1.5 rounded-full bg-[#6B7390]" />Bot offline</span>
      </div>
      <p className="m-0 text-sm leading-relaxed text-mute">
        Once the bot is set up, approved dubs can be sent to your group from here. The button stays locked until every line is approved and the video is rendered.
      </p>
      <button type="button" disabled={!canSend}
        className="h-[52px] rounded-full border-0 text-sm font-bold"
        style={{ background: canSend ? "#A99BFF" : "#232738", color: canSend ? "#0B0A18" : "#6B7390" }}>
        {canSend ? "Send to Telegram" : `🔒 ${reason}`}
      </button>
      {L.dubbed && (
        <a href={api.downloadUrl(job.id, langId)} className="flex h-12 items-center justify-center rounded-full border border-[#2C3247] text-sm font-bold text-ink no-underline">Download MP4</a>
      )}
    </section>
  );
}
