# Vaani Studio

A dubbing studio for Indian languages, built for the Gnani AI challenge. Upload a video, pick the languages, and get it back dubbed, with a separate voice for each speaker. A Telegram bot delivers dubs to private chats and groups.

## How it works

1. **Upload** a video (up to 5 minutes, 20 MB for the bot). ffmpeg extracts the audio.
2. **Transcribe** with Gnani Prisma, with speaker separation.
3. **Translate** with Gemini into the language you pick.
4. **Voice** each line with Gnani Timbre: a studio voice, or a clone of the original speaker (only with permission).
5. **Time-fit and mix**: lines are shortened or lengthened to fit their slot, sped up or slowed down slightly, and mixed over silence. The original audio is fully muted.
6. **Download** the dubbed MP4, or get it from the Telegram bot.

Lines stay editable; edit one and click Re-render.

## Languages

- **Spoken (video in):** Hindi, English, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali.
- **Dub into:** Kannada, Tamil, Telugu, Marathi, Malayalam, Bengali, Gujarati, Punjabi, Hindi, English, and **Konkani (experimental)**.
- **Konkani is experimental.** Gnani has no Konkani voice, so Gemini writes Goan Konkani in Devanagari and the Marathi voice reads it, with a Marathi-like accent. Have a Konkani speaker review it before real use.
- Cloned voices have only been tested in Hindi, Kannada, Tamil and English.

## Setup

You need **Node 20+** and **ffmpeg** (on your PATH).

```bash
npm install
npm --prefix client install
```

Create a file named `.env` in the project folder with your own keys. Never commit it; it is gitignored.

```
GNANI_API_KEY=your Gnani key
LLM_PROVIDER=gemini
LLM_API_KEY=your Gemini key
TELEGRAM_BOT_TOKEN=optional, from @BotFather (leave out to run without the bot)
```

Optional: `ALLOW_SIGNUP` (false closes sign-up), `TRUST_PROXY` (true behind a reverse proxy), `ALLOWED_ORIGINS` (extra allowed websites, comma-separated), `NODE_ENV=production` (Secure cookies over HTTPS), `LLM_MODEL` and `LLM_FALLBACK_MODEL`.

## Run

Open two terminals:

```bash
npm start           # API + Telegram bot on http://localhost:3001
npm run client      # the web app on http://localhost:5173
```

Open http://localhost:5173 and create an account. **The first account becomes the workspace owner.**

## Accounts

Sign-in is required. Passwords are hashed with scrypt, sessions use an HttpOnly cookie, and login attempts are throttled. Members see only their own videos; the owner also sees the Telegram bot's videos.

- Forgot a password: `npm run reset-password -- <email>`.
- Close sign-up after your team has accounts: `ALLOW_SIGNUP=false`.
- Not built: email verification, password-reset emails, social login. Accounts are stored in one JSON file (`work/auth.json`), so a real multi-server deployment would need a database.

## Telegram bot

Create a bot with @BotFather and put its token in `.env`. In a private chat, send a video. In a group, reply to a video with `/dub`. If the bot should react to plain videos in a group, make it a group admin or turn off privacy mode in BotFather. The bot downloads at most 20 MB.

## Project layout

- `src/` the dubbing pipeline (`pipeline.mjs`), speech (`tts.mjs`) and the LLM (`llm.mjs`)
- `server/` the Express API, accounts (`auth.mjs`) and the Telegram bot (`bot.mjs`)
- `client/` the React + Vite + Tailwind web app
- `scripts/` command-line helpers (`reset-password.mjs`, `run.mjs`)
- `work/` runtime data (videos, jobs, accounts); gitignored

## Responsible use

Only clone a voice you own or have permission to use; the app asks for confirmation before cloning. Use synthetic or consented material for demos.
