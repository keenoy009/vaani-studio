# Vaani Studio — project brief (read this first)

## What this is
A dubbing studio for Indian languages. A user uploads a Hindi/English (or other supported) video → we transcribe with speaker separation (Gnani Prisma) → Gemini translates → we voice each line (studio voice or a cloned voice) → time-fit + mix → dubbed MP4. There is also a text-to-voice "Voice message" feature. A Telegram bot delivers all of this to private chats and groups (health workers, farmers, students).
Built for the Gnani AI "Great Indian AI Internship Challenge". **Deadline: Nov 10 2026, 11:59 PM IST.** I (the user) am a beginner student; explain every step in plain language, tell me exactly which file to create and which command to run. Repo: https://github.com/keenoy009/vaani-studio (branch `main`).

## Rules for you (Claude Code)
- Guide me step by step. Small steps, run and verify each one before the next.
- Never put API keys in code or chat. Keys live in `.env` (gitignored). I deleted `.env.example`; the variables are listed in the README and below.
- Demo data must be synthetic or consented. Only clone voices I own or have permission to use.
- Be honest when something is risky or won't fit in the time. Cut scope before cutting quality.
- Never claim a feature works until we have run it. Say plainly what was and was not tested.
- Commit messages end with the `Co-Authored-By` line given by the harness. Push to `origin main` when I ask.

## Status (as of Nov 8 2026, 2 days to the deadline)
**Built and tested (automated + real browser/API runs):**
- Upload → STT (diarized) → translate → voice → mix → dubbed MP4, one click per language, all automatic. Lines editable + "Re-render". 10 dub languages + experimental Konkani. Per-speaker voice choice (13 studio voices with gender/persona, or "Match original speaker" cloning with a permission prompt).
- No-dead-air time fitting, movie-style one-row subtitles, original audio fully muted, Library (real mid-video thumbnails, rename, delete with confirmation), Download MP4 in the player.
- Accounts: sign-in/sign-up page, scrypt, HttpOnly sessions, throttling, per-user videos, owner role, password change, `npm run reset-password`.
- Telegram bot: private chats and groups, video dubbing (language → voice → result, "Change language", "Change voice", "Share to group" in private chats), `/dub` reply command, and text → voice note (`/say`, or plain text in a private chat).
- "Voice message" page: type text (≤1200 chars), choose languages + studio voice, get translated speech; every message is kept in an "Earlier voice messages" list showing ORIGINAL and TRANSLATED text, player, MP3/WAV, "Use this text again", Delete.
- Deployment prep: server serves the built website + `/healthz`; Dockerfile (built and run locally: ffmpeg present, healthy, data survives restart on a volume at `/app/work`); daily per-account usage limits; Telegram WEBHOOK mode + `render.yaml` for a free Telegram-only deploy.

**Built but NOT verified in the real world:**
- Free deploy on Render (webhook with the real Telegram servers, the sleeping behaviour, cold-start delay). Only tested offline with a mocked Telegram.
- Telegram voice notes on a real phone (format is Ogg/Opus; verified as a real Ogg file, not played on a phone by me). Confirm with the user.
- Konkani quality (needs the user's own review; they said they can review it).
- Cloned voices beyond Hindi, Kannada, Tamil, English; cloning with the user's own voice.
- Hindi as a dub TARGET end to end (needs a non-Hindi source video).

**Not built:** lip-sync (declined), email verification / reset emails / social login, a database (single JSON file), music separation.

## Decisions (newest wins)
- Nov 5: The user REMOVED the approval gate (no approve buttons). Clicking a language translates + voices + mixes automatically; lines stay editable, then "Re-render". Too-long machine translations are auto-shortened (user-edited lines never are). Voice per speaker is chosen on the Studio page. Original audio is fully muted (volume 0): only the dub is heard.
- Nov 6: All 10 languages are dub targets (kn, ta, te, mr, ml, bn, gu, pa, hi, en); a video can't be dubbed into its own spoken language. Spoken (STT) languages: hi, en, kn, ta, te, ml, mr, bn (gu/pa excluded: batch STT). The X/LinkedIn caption card ("Post your demo") was REMOVED: not part of the project. Lip-sync stays OUT. Library supports rename (display title only) and delete (confirmation; refused while processing). Library thumbnails: a real mid-video frame; ONE identical default cover only when a video has no frame.
- Nov 6: Voice cloning is BUILT ("Match original speaker") and the 13 studio voices with gender + persona text ("Warm, empathetic"…) must BOTH stay. Cloning: 5–30 s of a speaker's own speech → Gnani embedding → `vachana-vc-v1` (the live API REQUIRES `model`, despite its docs). Opt-in only: permission prompt in the Studio, "I have permission" button in Telegram; the server refuses without `cloneConsent`; needs ≥5 s of that speaker's speech, else a studio voice is used and a note is shown.
- Nov 6 (gaps): No dead air. Time-fit atempo 0.75–1.25. Speech < 85% of its slot → the LLM rewords fuller (same meaning, no new facts; kept only if it fits better and stays ≤110%); > 120% → shortened. Edited lines are never rewritten.
- Nov 6 (Telegram card): The Studio's Telegram card shows ONLY bot status, the groups the bot is in, and viewers. "Send to Telegram" and its API route were REMOVED (sharing happens inside Telegram). "Download dubbed MP4" lives in the video player and downloads the selected language/voice. Subtitles: movie-style, one row, transparent.
- Nov 6 (accounts): Sign-in is REQUIRED for the app/API. First account = workspace "owner" (also sees Telegram/older jobs); members see only their own. The bot authenticates with a private `X-Internal-Key` (random per start, or env `INTERNAL_KEY` ≥24 chars). Forgot password: `npm run reset-password -- <email>`.
- Nov 6 (bot in groups): the bot dubs in groups too (a video, or reply to one with `/dub`, which works even with Telegram privacy mode on, as it is for this bot). Only the sender can pick languages/voice in a group. No "Share to group" button inside groups.
- Nov 6 (Konkani): "Konkani" (`gom`) is an EXPERIMENTAL dub-into target. Gnani has no Konkani voice/STT: Gemini writes Goan Konkani in Devanagari and the Marathi voice (`mr-IN`) speaks it (Marathi-like accent). Labelled "experimental"; "Select all" skips it; no Konkani as a source language.
- Nov 7 (keep-words list): built, then the user REMOVED the UI from the upload screen, Studio and Voice message page. Only the UI is gone; the server code (`job.glossary`, `PUT /api/jobs/:id/glossary`, `glossary` on `POST /api/speak`) remains, unused. Safe to delete if wanted.
- Nov 7 (voice messages): New "Voice message" page + Telegram text mode. Studio voices only (cloning needs a reference video). Long text is split into ≤260-char pieces and joined. Files in `work/speak/` (`POST /api/speak`, `GET /api/speak`, `GET /api/speak/:id/audio?format=mp3|wav|ogg`, `DELETE /api/speak/:id`); owner-only. The user asked that EVERY message be kept (no auto-delete) and that BOTH the original and translated text be shown.
- Nov 7 (Telegram text): plain text in a private chat, or `/say text` / reply `/say` in a group; language → voice → Ogg/Opus voice note + "Another language". Only the sender can choose in a group. 1200-character limit.
- Nov 7 (deployment): the user wants it FREE, used directly from Telegram (website not needed). So: Telegram webhook mode (`PUBLIC_URL`, or Render's `RENDER_EXTERNAL_URL`; `POST /telegram/webhook`, secret header derived from the token; replies 200 after 5 s while work continues so Telegram does not re-send), `render.yaml` (free plan, `ALLOW_SIGNUP=false`, keys typed into the Render dashboard). Free plan = no persistent disk (data wiped on restart) and it sleeps when idle. A paid host needs a disk at `/app/work` and exactly ONE instance. Recommended paid option if ever needed: Render Starter (~$7/mo + disk).
- Nov 7 (limits): per-account daily limits protect the Gnani/Gemini quota: `DAILY_DUB_LIMIT` (default 30), `DAILY_VOICE_LIMIT` (default 100); the Telegram bot shares 3× that between all its users; 0 = off; counts in `work/usage.json`.
- Nov 7 (ideas the user did not want): the "meaning check" (back-translation) and the other suggested features were declined; the user picked the Voice message page and the Telegram text mode instead.

## Scope
- IN: everything under "Built" above.
- OUT: lip-sync, music separation, email/social auth, a database. Gnani has no translation (Gemini does it).
- Parked ideas (only if time remains; feature freeze is planned for Nov 9): back-translation meaning check, subtitle (SRT) download, per-language quality report, pronunciation respelling.

## Gnani APIs (base https://api.vachana.ai, header `X-API-Key-ID: <key>`)
- STT Prisma batch: `POST /stt/v3/batch/jobs` (multipart) → `/start` → poll → `/files` → `transcript_url`. The multipart body is HAND-BUILT because Node's FormData adds a filename to the config part and Gnani then returns 500. Models prisma-v2.5 (used). Batch: 10 MB direct upload; Gujarati/Punjabi unsupported.
- TTS Timbre: `POST /api/v1/tts/inference`, `model: timbre-v3.0`, 13 voices. The TTS API returns HTTP 200 for ANY language string (even invented ones), so a 200 is not proof of support. 429s are retried.
- Voice clone: `/api/v1/tts/voice-clone/embeddings` (multipart `audio_file`, 5–30 s) then inference with `model: "vachana-vc-v1"` + `speaker_embedding`.
- Languages: hi, en, ta, te, kn, ml, mr, bn, gu, pa (-IN).
- Gemini (translation): `generateContent` with `x-goog-api-key`; default `gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`; 429/503 retry; tolerant JSON parsing (`parseLoose`) because Gemini sometimes appends a stray `}`. A strict per-language script check rejects lines containing letters from another script (Gemini once returned Bengali for Kannada), then retries.
- Verify exact request/response shapes in Gnani docs before coding; do not guess.

## Pipeline
1. ffmpeg extracts mono 16 kHz audio. 2. Prisma batch STT with diarization → segments. 3. Gemini translates each segment (script-checked). 4. TTS per segment with the chosen voice per speaker (preset or cloned). 5. Time-fit: shorten/lengthen by LLM, then `atempo` 0.75–1.25. 6. `adelay` + `amix` over silence, mux with `-c:v copy`; original audio dropped. `MIX_VERSION=2` invalidates older dubs (they show "needs re-render").

## Tech stack, files and running
- Node 20+ / Express 5 (ES modules), React 19 + Vite + Tailwind 4 (`client/`), grammY (Telegram), ffmpeg on PATH, Docker optional.
- `src/` pipeline.mjs (core), tts.mjs, llm.mjs, speak.mjs (voice messages). `server/` index.mjs (API, limits, static site), auth.mjs, bot.mjs. `client/src/` App.jsx, api.js, components/ (AuthPage, Upload, Player, Review, Timing, VoiceBar/VoiceSelect, Telegram, Speak, Pages…). `scripts/` reset-password.mjs, run.mjs and older 00–05 CLI steps (legacy). `work/` runtime data (gitignored). `Dockerfile`, `render.yaml`.
- Run in development: terminal 1 `npm start` (API + bot on :3001), terminal 2 `npm run client` (web app on :5173). Production: `npm run build` then `npm run start:prod`.
- Env vars: `GNANI_API_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `TELEGRAM_BOT_TOKEN`, `ALLOW_SIGNUP`, `TRUST_PROXY`, `ALLOWED_ORIGINS`, `NODE_ENV`, `PUBLIC_URL`, `DAILY_DUB_LIMIT`, `DAILY_VOICE_LIMIT`, `INTERNAL_KEY`; path/port overrides `PORT`, `AUTH_FILE`, `JOBS_DIR`, `SPEAK_DIR`, `USAGE_FILE`.
- IMPORTANT: only ONE copy of the server may run per bot token (two copies make two bots fight: "Conflict: terminated by other getUpdates request"). In VS Code use PowerShell; stop a running copy with Ctrl+C before starting another. After changing server code the user must restart `npm start`.
- Testing approach used so far: throwaway servers on port 3002 with `AUTH_FILE`/`JOBS_DIR`/`INTERNAL_KEY` and `TELEGRAM_BOT_TOKEN=""` so real data and the real bot are never touched; fake Telegram updates through `bot.handleUpdate` with a mocked API; Edge headless + CDP for browser tests. These test scripts live in the session scratchpad, NOT in the repo.
- Windows/shell gotchas: files are CRLF (edit scripts must be line-based); in this harness double backslashes in shell heredocs get halved, so write scripts with the Write tool; the Bash `cd` can leave the shell in `client/` — use absolute paths.

## UI direction (dark)
Colors: bg #07080C, panels #101219, lavender #A99BFF, pink #FFA6E7, peach #FFB68F, mint #6EE7B7. Font: Plus Jakarta Sans (+ Noto Sans for Indic scripts), JetBrains Mono for timestamps. Left icon menu: Studio, Voice message, Library, Telegram bot, Settings. Studio flow: upload → processing → ready (player with Original/Dubbed toggle, language cards, timing chart, voice bar, line-by-line editor, Telegram card). If I attach a screenshot of the UI, match it.

## Telegram bot flow
Video: "which language is spoken?" → "dub into?" → "which voice?" (match original / default / 6 named voices) → progress → dubbed video + [Share to group] (private only) [Change language] [Change voice]. Text: language → voice → voice note + [Another language]. Groups: `/dub` (reply to a video) and `/say` (text, or reply to a message); the bot downloads at most 20 MB; if the bot is a group admin (or privacy mode is off) it also sees plain videos.

## Next steps (in order; deadline Nov 10, 11:59 PM IST)
1. **Real-phone check (15 min):** in Telegram send the bot (a) a short sentence and confirm the voice note plays, (b) a video, and tell Claude what broke. Fix only real bugs.
2. **Dry run of the full demo (1–2 h):** a real or synthetic Hindi video end to end (upload → 2–3 languages → playback → download → Telegram delivery). Use a clip the user owns; clone only with permission. Also try one non-Hindi source so Hindi-as-target is verified, and the user should review Konkani lines.
3. **Feature freeze on Nov 9.** Only bug fixes after that.
4. **Submission pack (must exist before Nov 10 11:59 PM IST):** demo video of the working app, a written explanation of the project, which Gnani technology was used (Prisma STT with diarization, Timbre TTS, voice cloning), and public LinkedIn/X post links. Re-check the official rules at https://www.gnani.ai/internship (sources disagree on award category names; "Solo Ninja" and "Jugaad Genius" were the ones found). Suggested story: one health message dubbed into several languages and delivered through the Telegram bot.
5. **Free deploy (optional, only after the demo video is recorded):** follow the README section "Free deployment (Telegram only)": Render → New → Blueprint → paste the three keys → stop the local bot → message the bot. Needs the user's Render account (may ask for a card). Expect a cold-start delay after idle; an uptime pinger on `/healthz` avoids it. Data is wiped on restart (no disk).
6. **Housekeeping (small):** delete the unused keep-words server code if no longer wanted; keep README and this file in sync.

## Known risks / limitations (be honest about these in the write-up)
- Konkani is experimental and unreviewed; the voice is Marathi, so the accent differs.
- Cloned-voice quality is verified only for hi/kn/ta/en and needs consent from the speaker.
- Translation quality depends on Gemini; no automatic meaning check (declined feature).
- Single-file storage and one-instance design; free hosting loses data on restart and sleeps when idle.
- Videos up to 5 minutes; the bot downloads at most 20 MB; Gujarati/Punjabi cannot be a spoken (source) language.
