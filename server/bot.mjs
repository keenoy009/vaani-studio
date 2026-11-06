// Telegram bot (grammY, long polling). It talks to the SAME local REST API the Studio uses, so a dub made
// from Telegram shows up in the Library like any other.
//
// Flow:  video -> "which language is spoken?" -> "dub into?" -> live progress -> dubbed video
//        + [Share to group] [Change language]
import { Bot, InlineKeyboard, InputFile } from "grammy";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";

const STATE_FILE = resolve("work/telegram.json");
const MAX_DOWNLOAD = 20 * 1024 * 1024; // Telegram only lets bots download files up to 20 MB
const MAX_SECONDS = 290;                // same limit as the Studio
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [native name, English name]
const LANGS = {
  hi: ["हिन्दी", "Hindi"], en: ["English", "English"], kn: ["ಕನ್ನಡ", "Kannada"], ta: ["தமிழ்", "Tamil"], te: ["తెలుగు", "Telugu"],
  ml: ["മലയാളം", "Malayalam"], mr: ["मराठी", "Marathi"], bn: ["বাংলা", "Bengali"], gu: ["ગુજરાતી", "Gujarati"], pa: ["ਪੰਜਾਬੀ", "Punjabi"],
};
const SOURCES = ["hi", "en", "kn", "ta", "te", "ml", "mr", "bn"]; // spoken languages Gnani's batch STT handles
const TARGETS = Object.keys(LANGS);                              // all 10
const label = (id) => `${LANGS[id][0]} ${LANGS[id][1] === LANGS[id][0] ? "" : "· " + LANGS[id][1]}`.trim();

// ---------- state shown in the Studio (groups the bot is in, people who used it) ----------
let running = false;
let botUsername = null;
let data = { groups: [], viewers: [] };

async function loadState() {
  try { const j = JSON.parse(await readFile(STATE_FILE, "utf8")); data = { groups: j.groups ?? [], viewers: j.viewers ?? [] }; } catch { /* first run */ }
}
async function saveState() {
  try { await mkdir(dirname(STATE_FILE), { recursive: true }); await writeFile(STATE_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error("[bot] could not save state:", e.message); }
}
export const telegramState = () => ({ online: running, botUsername, groups: data.groups, viewers: data.viewers.map(({ key, ...v }) => v) });

function upsertViewer(key, patch) {
  const i = data.viewers.findIndex((v) => v.key === key);
  if (i >= 0) data.viewers[i] = { ...data.viewers[i], ...patch };
  else data.viewers.unshift({ key, ...patch });
  data.viewers = data.viewers.slice(0, 12);
  return saveState();
}

// ---------- voice choices ----------
// [name, icon, how the voice speaks]  (from Gnani's voice catalogue)
const VOICE_CHOICES = [
  ["Shivani", "👩", "warm, empathetic"], ["Lakshmi", "👩", "expressive, energetic"], ["Riyaa", "👩", "confident, authoritative"],
  ["Avinash", "👨", "professional"], ["Devansh", "👨", "conversational"], ["Prakash", "👨", "professional"],
];
const VOICE_IDS = ["clone", "default", ...VOICE_CHOICES.map(([n]) => n)];
const VOICE_NOTE = "Which voice should the dub use?\n\n" +
  VOICE_CHOICES.map(([name, icon, style]) => `${icon} ${name}: ${style}`).join("\n") +
  "\n\n🎙 “Match original voice” copies each speaker's real voice, so only choose it if you have the speakers' permission.";
function voiceKeyboard(prefix) {
  const kb = new InlineKeyboard().text("🎙 Match original voice (I have permission)", `${prefix}:clone`).row().text("Default voices", `${prefix}:default`).row();
  VOICE_CHOICES.forEach(([name, icon], i) => { kb.text(`${icon} ${name}`, `${prefix}:${name}`); if (i % 3 === 2) kb.row(); });
  return kb;
}

const STAGE_TEXT = { audio: "Extracting the audio", transcribe: "Listening and separating speakers", translate: "Translating each line", voice: "Recording the dubbed voices" };

// ---------- the bot ----------
/**
 * @param {object} o
 * @param {string} o.token      Telegram bot token (never logged)
 * @param {string} o.apiBase    e.g. http://localhost:3001
 * @param {Function} [o.download]  async (file, token) => Buffer ; injectable so tests need no Telegram network
 * @param {object} [o.botInfo]  skip the getMe call (tests)
 * @param {string} [o.internalKey]  secret that lets the bot call the (sign-in protected) Studio API
 */
export function createBot({ token, apiBase, download, botInfo, internalKey }) {
  const bot = new Bot(token, botInfo ? { botInfo } : {});
  // Log what arrives (type only, never the content) so problems are easy to diagnose.
  bot.use(async (ctx, next) => {
    const kinds = ["text", "video", "document", "animation", "photo", "audio", "voice", "video_note", "sticker"].filter((k) => ctx.msg?.[k]);
    const what = ctx.callbackQuery ? `button ${ctx.callbackQuery.data?.slice(0, 2)}` : ctx.myChatMember ? "added/removed in a chat" : kinds.join("+") || Object.keys(ctx.update).filter((k) => k !== "update_id").join("+");
    console.log(`[bot] ${new Date().toLocaleTimeString()} ${ctx.chat?.type ?? "?"}: ${what}`);
    await next();
  });
  const pending = new Map(); // request key -> { fileId, name, size, duration, userName, chatId, source, started, at }

  const fetchDownload = download ?? (async (file) => {
    const r = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`Telegram did not give me the file (HTTP ${r.status}).`);
    return Buffer.from(await r.arrayBuffer());
  });

  // The bot is not a signed-in person: it identifies itself to the Studio API with a secret only this server process knows.
  const internal = internalKey ? { "X-Internal-Key": internalKey } : {};
  const apiJson = async (method, path, body) => {
    const r = await fetch(apiBase + path, { method, signal: AbortSignal.timeout(60000), headers: { ...internal, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  };
  const newKey = () => randomBytes(4).toString("hex");
  const prune = () => { const cutoff = Date.now() - 3600_000; for (const [k, p] of pending) if (p.at < cutoff) pending.delete(k); };
  const edit = (api, chatId, msgId, text, extra) => api.editMessageText(chatId, msgId, text, extra).catch(() => {}); // "not modified" etc. are harmless

  const langKeyboard = (ids, prefix) => {
    const kb = new InlineKeyboard();
    ids.forEach((id, i) => { kb.text(label(id), `${prefix}:${id}`); if (i % 2 === 1) kb.row(); });
    return kb;
  };

  const friendly = (e) => {
    const m = String(e?.message ?? e);
    if (/file is too big/i.test(m)) return "That file is too big for me to download. Telegram only allows bots to download videos up to 20 MB.";
    if (/busy right now/i.test(m)) return "The translation service is busy right now. Please try again in a minute.";
    return m.length > 220 ? m.slice(0, 220) + "…" : m;
  };

  // Poll the Studio API until this language is finished. onTick(text) is called with a progress line.
  async function waitForDub(jobId, lang, onTick) {
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > 12 * 60_000) throw new Error("This is taking too long. Please try again.");
      const job = await apiJson("GET", `/api/jobs/${jobId}`);
      if (job.status === "failed") throw new Error(job.error || "The video could not be processed.");
      const L = job.langs[lang];
      if (job.status !== "processing" && L) {
        if (L.status === "done") return job;
        if (L.status === "failed") throw new Error(L.error || "Dubbing failed.");
        onTick(L.status === "translating" ? STAGE_TEXT.translate : STAGE_TEXT.voice);
      } else onTick(STAGE_TEXT[job.stage] || "Working on it");
      await sleep(3000);
    }
  }

  // In a group, only the person who sent the video may choose its languages and voice (others get a small notice).
  async function mine(ctx, p) {
    if (p && p.chatType !== "private" && p.userId && ctx.from?.id !== p.userId) {
      await ctx.answerCallbackQuery({ text: `Only ${p.userName} can choose for this video.` });
      return false;
    }
    await ctx.answerCallbackQuery();
    return true;
  }

  async function sendResult(api, chatId, jobId, lang, title, inGroup = false) {
    const r = await fetch(`${apiBase}/api/jobs/${jobId}/langs/${lang}/video?download=1`, { headers: internal, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error("The dubbed video is not available any more.");
    const buf = Buffer.from(await r.arrayBuffer());
    const me = botUsername || (await api.getMe()).username;
    const kb = new InlineKeyboard();
    if (!inGroup) kb.url("Share to group", `https://t.me/${me}?startgroup=share_${jobId}_${lang}`).row(); // pointless inside a group
    kb.text("Change language", `c:${jobId}`).text("Change voice", `cv:${jobId}:${lang}`);
    await api.sendVideo(chatId, new InputFile(buf, `${title.replace(/[^\w-]+/g, "_").slice(0, 40) || "dub"}_${lang}.mp4`), {
      caption: `Dubbed into ${LANGS[lang][1]} (${LANGS[lang][0]})`, reply_markup: kb, supports_streaming: true,
    });
  }

  // Shared by "new video" and "change language": runs the dub and delivers the result into chatId.
  async function dubAndDeliver({ api, chatId, statusMsgId, jobId, lang, title, viewerKey, inGroup = false }) {
    let last = "";
    const tick = (t) => { const text = `⏳ ${t}…`; if (text !== last) { last = text; edit(api, chatId, statusMsgId, text); } };
    try {
      const job = await waitForDub(jobId, lang, tick);
      await sendResult(api, chatId, jobId, lang, title, inGroup);
      const notes = job.langs[lang]?.cloneNotes ?? [];
      if (notes.length) await api.sendMessage(chatId, `ℹ️ ${notes[0]}`).catch(() => {});
      await api.deleteMessage(chatId, statusMsgId).catch(() => {});
      await upsertViewer(viewerKey, { state: "Done" });
    } catch (e) {
      await edit(api, chatId, statusMsgId, `😕 Sorry, that didn't work.\n${friendly(e)}`);
      await upsertViewer(viewerKey, { state: "Failed" });
    }
  }

  // ----- commands -----
  const welcome = "Hi, I'm Vaani 🎙️\n\nSend me a short video (up to 5 minutes and 20 MB) and I'll dub it into an Indian language: Kannada, Tamil, Telugu, Marathi, Malayalam, Bengali, Gujarati, Punjabi, Hindi or English.\n\nYou can pick the voice too, or have me match the original speaker's voice.";
  // Telegram "privacy mode" hides ordinary group messages (like a video) from a bot unless the bot is a group admin.
  // Commands always arrive, so "/dub" as a reply to a video is the way that always works.
  async function seesAllMessages(ctx) {
    if (botInfo?.can_read_all_group_messages || bot.botInfo?.can_read_all_group_messages) return true;
    try { const m = await ctx.api.getChatMember(ctx.chat.id, bot.botInfo.id); return ["administrator", "creator"].includes(m.status); } catch { return false; }
  }
  async function showHelp(ctx) {
    if (ctx.chat.type === "private") return ctx.reply(`${welcome}\n\nIn a group, reply to a video with /dub.`);
    const all = await seesAllMessages(ctx);
    return ctx.reply("Hi, I'm Vaani 🎙️ I dub videos into Indian languages.\n\n" + (all
      ? "Send a video here, or reply to one with /dub."
      : "Reply to a video with /dub and I'll dub it.\n\nI can't see ordinary videos in this group, so please use /dub. (To make me react to every video, make me a group admin.)"));
  }
  bot.command("start", async (ctx) => {
    const payload = ctx.match?.trim();
    const m = payload && /^share_([0-9a-f-]{36})_([a-z]{2})$/.exec(payload);
    if (m && ctx.chat.type !== "private") { // the "Share to group" link: post that dub into this group
      const [, jobId, lang] = m;
      try { await sendResult(ctx.api, ctx.chat.id, jobId, lang, "dub", true); }
      catch { await ctx.reply("Sorry, that dubbed video is not available any more."); }
      return;
    }
    await showHelp(ctx);
  });
  bot.command("help", (ctx) => showHelp(ctx));

  // ----- a video arrives -----
  // Works in private chats AND groups. `replyTo` = the message holding the video (the video itself, or the one /dub replied to).
  async function onMedia(ctx, media, replyTo = ctx.msg.message_id) {
    if (media.file_size && media.file_size > MAX_DOWNLOAD) {
      return ctx.reply(`That video is ${(media.file_size / 1048576).toFixed(0)} MB. Telegram only lets bots download files up to 20 MB, so please send a smaller or shorter one.`);
    }
    if (media.duration && media.duration > MAX_SECONDS) {
      return ctx.reply(`That video is ${Math.floor(media.duration / 60)}:${String(media.duration % 60).padStart(2, "0")} long. I can dub videos up to about 5 minutes.`);
    }
    prune();
    const key = newKey();
    pending.set(key, { fileId: media.file_id, name: media.file_name || "video.mp4", userName: ctx.from?.first_name || "Someone", userId: ctx.from?.id, chatId: ctx.chat.id, chatType: ctx.chat.type, started: false, at: Date.now() });
    await ctx.reply("Which language is spoken in this video?", {
      reply_markup: langKeyboard(SOURCES, `s:${key}`), reply_parameters: { message_id: replyTo, allow_sending_without_reply: true },
    });
  }
  // "/dub" as a reply to a video. Telegram always delivers commands to a bot, even in a group where privacy mode hides normal messages.
  bot.command("dub", async (ctx) => {
    const m = ctx.msg.reply_to_message;
    const media = m?.video ?? m?.video_note ?? m?.animation ?? (m?.document?.mime_type?.startsWith("video/") ? m.document : null);
    if (!media) return ctx.reply("Reply to a video with /dub and I'll dub it.", { reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true } });
    return onMedia(ctx, media, m.message_id);
  });
  bot.on("message:video", (ctx) => onMedia(ctx, ctx.msg.video));
  bot.on("message:video_note", (ctx) => onMedia(ctx, ctx.msg.video_note));
  bot.on("message:document", (ctx) => (ctx.msg.document.mime_type?.startsWith("video/")
    ? onMedia(ctx, ctx.msg.document)
    : ctx.chat.type === "private" ? ctx.reply("I can only dub videos. Please send an MP4 or other video file.") : undefined));
  bot.on("message:animation", (ctx) => onMedia(ctx, ctx.msg.animation)); // some apps send short videos as "animations"
  // Anything else in a private chat still gets an answer, so the bot never looks dead.
  bot.on("message", (ctx) => (ctx.chat.type === "private" ? ctx.reply("I can dub videos. Please send me a video (MP4 or similar, up to 5 minutes and 20 MB).") : undefined));

  // ----- button: spoken language -----
  bot.callbackQuery(/^s:([0-9a-f]{8}):([a-z]{2})$/, async (ctx) => {
    const [, key, source] = ctx.match;
    const p = pending.get(key);
    if (!(await mine(ctx, p))) return;
    const chatId = ctx.callbackQuery.message.chat.id;
    const msgId = ctx.callbackQuery.message.message_id;
    if (!p || !SOURCES.includes(source)) return edit(ctx.api, chatId, msgId, "This request has expired. Please send the video again.");
    p.source = source;
    await edit(ctx.api, chatId, msgId, `Spoken in ${LANGS[source][1]}. Dub into which language?`, {
      reply_markup: langKeyboard(TARGETS.filter((t) => t !== source), `t:${key}`),
    });
  });

  // ----- button: dub into -> ask which voice -----
  bot.callbackQuery(/^t:([0-9a-f]{8}):([a-z]{2})$/, async (ctx) => {
    const [, key, lang] = ctx.match;
    const p = pending.get(key);
    if (!(await mine(ctx, p))) return;
    const chatId = ctx.callbackQuery.message.chat.id;
    const msgId = ctx.callbackQuery.message.message_id;
    if (!p || !p.source || !TARGETS.includes(lang) || lang === p.source) return edit(ctx.api, chatId, msgId, "This request has expired. Please send the video again.");
    p.target = lang;
    await edit(ctx.api, chatId, msgId, `${LANGS[p.source][1]} → ${LANGS[lang][1]}.\n\n${VOICE_NOTE}`, { reply_markup: voiceKeyboard(`v:${key}`) });
  });

  // ----- button: voice chosen -> start the dub -----
  bot.callbackQuery(/^v:([0-9a-f]{8}):(\w+)$/, async (ctx) => {
    const [, key, voice] = ctx.match;
    const p = pending.get(key);
    if (!(await mine(ctx, p))) return;
    const chatId = ctx.callbackQuery.message.chat.id;
    const msgId = ctx.callbackQuery.message.message_id;
    if (!p || !p.source || !p.target || !VOICE_IDS.includes(voice)) return edit(ctx.api, chatId, msgId, "This request has expired. Please send the video again.");
    if (p.started) return; // double tap
    p.started = true;
    const lang = p.target;
    const what = `${LANGS[p.source][1]} → ${LANGS[lang][1]}${voice === "clone" ? " · original voice" : voice !== "default" ? ` · ${voice}` : ""}`;
    await upsertViewer(key, { name: p.userName, what, state: "Dubbing", at: new Date().toISOString() });
    await edit(ctx.api, chatId, msgId, "⏳ Getting your video…");
    try {
      const file = await ctx.api.getFile(p.fileId);
      const buf = await fetchDownload(file);
      const fd = new FormData();
      fd.append("source", p.source); fd.append("targets", lang);
      if (voice !== "default") fd.append("voice", voice);
      if (voice === "clone") fd.append("cloneConsent", "true"); // choosing "Match original voice (I have permission)" is the confirmation
      fd.append("video", new Blob([buf]), /\.(mp4|mov|mkv|webm|m4v)$/i.test(p.name) ? p.name : "video.mp4");
      const r = await fetch(`${apiBase}/api/jobs`, { method: "POST", headers: internal, body: fd, signal: AbortSignal.timeout(120000) });
      const job = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(job.error || "The Studio rejected the video.");
      await apiJson("PATCH", `/api/jobs/${job.id}`, { title: `Telegram · ${p.userName}` }).catch(() => {});
      pending.delete(key);
      await dubAndDeliver({ api: ctx.api, chatId, statusMsgId: msgId, jobId: job.id, lang, title: p.userName, viewerKey: key, inGroup: p.chatType !== "private" });
    } catch (e) {
      await edit(ctx.api, chatId, msgId, `😕 Sorry, that didn't work.\n${friendly(e)}`);
      await upsertViewer(key, { state: "Failed" });
    }
  });

  // ----- button: change voice (re-render the same dub with another voice) -----
  bot.callbackQuery(/^cv:([0-9a-f-]{36}):([a-z]{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, jobId, lang] = ctx.match;
    await ctx.reply(VOICE_NOTE, { reply_markup: voiceKeyboard(`w:${jobId}:${lang}`) });
  });
  bot.callbackQuery(/^w:([0-9a-f-]{36}):([a-z]{2}):(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, jobId, lang, voice] = ctx.match;
    const chatId = ctx.callbackQuery.message.chat.id;
    const msgId = ctx.callbackQuery.message.message_id;
    const key = newKey();
    try {
      if (!TARGETS.includes(lang) || !VOICE_IDS.includes(voice)) throw new Error("bad choice");
      await upsertViewer(key, { name: ctx.from?.first_name || "Someone", what: `new voice: ${voice === "clone" ? "original voice" : voice === "default" ? "default" : voice}`, state: "Dubbing", at: new Date().toISOString() });
      await edit(ctx.api, chatId, msgId, "⏳ Applying the voice…");
      const speakers = await apiJson("GET", `/api/jobs/${jobId}/voices`);
      const body = {};
      for (const s of speakers) body[s.speaker] = voice === "clone" ? (s.canClone ? "clone" : "default") : voice; // a speaker with too little speech keeps a studio voice
      if (voice === "clone") body.cloneConsent = true; // the button says "I have permission"
      await apiJson("PUT", `/api/jobs/${jobId}/voices`, body);
      await apiJson("POST", `/api/jobs/${jobId}/langs/${lang}/render`);
      await dubAndDeliver({ api: ctx.api, chatId, statusMsgId: msgId, jobId, lang, title: ctx.from?.first_name || "dub", viewerKey: key, inGroup: ctx.callbackQuery.message.chat.type !== "private" });
    } catch (e) {
      await edit(ctx.api, chatId, msgId, `😕 Sorry, that didn't work.\n${friendly(e)}`);
      await upsertViewer(key, { state: "Failed" });
    }
  });

  // ----- button: change language (re-dub the same video) -----
  bot.callbackQuery(/^c:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      const job = await apiJson("GET", `/api/jobs/${ctx.match[1]}`);
      const ids = TARGETS.filter((t) => t !== job.source);
      const kb = new InlineKeyboard();
      ids.forEach((id, i) => { kb.text(label(id), `d:${job.id}:${id}`); if (i % 2 === 1) kb.row(); });
      await ctx.reply("Dub the same video into which language?", { reply_markup: kb });
    } catch { await ctx.reply("Sorry, I can't find that video any more. Please send it again."); }
  });
  bot.callbackQuery(/^d:([0-9a-f-]{36}):([a-z]{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, jobId, lang] = ctx.match;
    const chatId = ctx.callbackQuery.message.chat.id;
    const msgId = ctx.callbackQuery.message.message_id;
    const key = newKey();
    try {
      const job = await apiJson("GET", `/api/jobs/${jobId}`);
      if (!TARGETS.includes(lang) || lang === job.source) throw new Error("bad language");
      await upsertViewer(key, { name: ctx.from?.first_name || "Someone", what: `${LANGS[job.source][1]} → ${LANGS[lang][1]}`, state: "Dubbing", at: new Date().toISOString() });
      await edit(ctx.api, chatId, msgId, "⏳ Starting…");
      const existing = job.langs[lang];
      if (!existing || existing.status === "failed") await apiJson("POST", `/api/jobs/${jobId}/langs/${lang}`);
      else if (!existing.dubbed && existing.status === "review") await apiJson("POST", `/api/jobs/${jobId}/langs/${lang}/render`);
      await dubAndDeliver({ api: ctx.api, chatId, statusMsgId: msgId, jobId, lang, title: ctx.from?.first_name || "dub", viewerKey: key, inGroup: ctx.callbackQuery.message.chat.type !== "private" });
    } catch (e) {
      await edit(ctx.api, chatId, msgId, `😕 Sorry, that didn't work.\n${friendly(e)}`);
      await upsertViewer(key, { state: "Failed" });
    }
  });

  // ----- groups the bot is added to / removed from (shown in the Studio) -----
  bot.on("my_chat_member", async (ctx) => {
    const u = ctx.myChatMember, chat = u.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    const id = String(chat.id);
    if (["member", "administrator"].includes(u.new_chat_member.status)) {
      const members = await ctx.api.getChatMemberCount(chat.id).catch(() => null);
      data.groups = [...data.groups.filter((g) => g.id !== id), { id, name: chat.title || "Group", members }];
      if (["left", "kicked"].includes(u.old_chat_member.status)) { // just joined: say how to use me here
        // Telegram "privacy mode" hides ordinary group messages from bots, except for admins. /dub (a command) always works.
        const seesAll = botInfo?.can_read_all_group_messages || bot.botInfo?.can_read_all_group_messages || u.new_chat_member.status === "administrator";
        await ctx.api.sendMessage(chat.id, "Hi everyone, I'm Vaani 🎙️ I dub videos into Indian languages.\n\n" +
          (seesAll ? "Send a video here, or reply to a video with /dub." : "Reply to any video with /dub and I'll dub it.\n(If you'd like me to react to every video, make me a group admin.)")).catch(() => {});
      }
    } else if (["left", "kicked"].includes(u.new_chat_member.status)) {
      data.groups = data.groups.filter((g) => g.id !== id);
    }
    await saveState();
  });

  bot.catch((err) => console.error("[bot] error while handling an update:", err.error?.message ?? err.message));
  return bot;
}

// ---------- start / use from the server ----------
export async function startBot({ token, apiBase, internalKey }) {
  await loadState();
  const bot = createBot({ token, apiBase, internalKey });
  try { await bot.init(); } catch (e) { console.error("[bot] Telegram rejected the token:", e.description || e.message); return null; }
  botUsername = bot.botInfo.username;
  await bot.api.setMyCommands([
    { command: "dub", description: "Reply to a video with /dub to dub it" },
    { command: "start", description: "How to use Vaani" }, { command: "help", description: "Help" },
  ]).catch(() => {});
  bot.start({ allowed_updates: ["message", "callback_query", "my_chat_member"], onStart: () => { running = true; console.log(`[bot] online as @${botUsername}`); } })
    .catch((e) => { running = false; console.error("[bot] stopped:", e.description || e.message); })
    .finally(() => { running = false; });
  process.once("SIGINT", () => bot.stop());
  return bot;
}
