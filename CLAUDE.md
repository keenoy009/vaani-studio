# Vaani Studio — project brief (read this first)

## What this is
A dubbing studio for Indian languages. User uploads a Hindi/English video → we transcribe with speaker separation → translate → a HUMAN reviews/edits/approves every line → we voice each line (cloned or studio voice) → time-fit + mix → dubbed MP4. A Telegram bot delivers results to groups (health workers, farmers, students).
Built for the Gnani AI "Great Indian AI Internship Challenge". Deadline: Nov 10 2026, 11:59 PM IST. I (the user) am a student; explain every step in plain language, tell me exactly which file to create and which command to run.

## Decisions that changed the brief (newest wins)
- Nov 5: The user REMOVED the approval gate. No approve buttons; clicking a language translates + voices + mixes automatically. Lines stay editable, then "Re-render". Too-long machine translations are auto-shortened (user-edited lines never are). Voice per speaker is chosen on the studio page. Original audio is fully muted (volume 0): only the dub is heard. "Send to Telegram" now only needs a finished, up-to-date dub.

- Nov 6: All 10 languages are dub targets (kn, ta, te, mr, ml, bn, gu, pa, hi, en); a video can't be dubbed into its own spoken language. Spoken (STT) languages: hi, en, kn, ta, te, ml, mr, bn (gu/pa excluded: batch STT). The X/LinkedIn caption card ("Post your demo") was REMOVED by the user: not part of the project. Lip-sync stays OUT (see below). Library supports rename (display title only) and delete (confirmation; refused while a video is processing).

- Nov 6 (later): Voice cloning is BUILT ("Match original speaker"): 5-30 s of each speaker's own speech is cut from the video audio -> Gnani embedding -> `vachana-vc-v1` (the live API REQUIRES `model`, despite its docs). Opt-in only: the user must confirm permission (Studio prompt; Telegram button says "I have permission"); the server refuses without `cloneConsent`. Needs >= 5 s of that speaker's speech, else a studio voice is used and a note is shown. Telegram asks for a voice after the language and has a "Change voice" button. Tested cloned voices: Hindi, Kannada, Tamil, English only.

- Nov 6 (gaps): No dead air. Time-fit is now 0.75-1.25x atempo (was 0.85-1.25x). A line whose speech is < 85% of its slot is reworded fuller by the LLM (same meaning, no new facts; kept only if it fits better and stays <= 110% of the slot); > 120% is shortened. Lines the user edited are never rewritten.

- Nov 6 (Telegram card): The Studio's Telegram card only shows the bot status, the groups the bot is in, and the viewers. The "Send to Telegram" button and its API route were REMOVED (sending happens inside Telegram via the bot's "Share to group"). "Download dubbed MP4" lives in the video player and downloads the dub of the selected language/voice.

- Nov 6 (accounts): Sign-in is REQUIRED for the whole app/API. Email + password accounts (scrypt hashes, HttpOnly SameSite=Lax session cookie, only token hashes stored, login throttling, Origin check against cross-site requests) in `work/auth.json` (server/auth.mjs). First account = workspace "owner" (also sees Telegram/older jobs); other members see only their own videos. The Telegram bot is not a person: it calls the API with a private `X-Internal-Key` (random per start). Forgot password: `npm run reset-password -- <email>` (no email service). Not built: email verification, password-reset emails, social login. Storage is a single JSON file; a real multi-server deployment would need a database.
- Nov 6 (bot in groups): the bot dubs videos in groups too (send a video, or reply to one with /dub, which works even with Telegram privacy mode on). Only the sender can choose languages/voice in a group. No "Share to group" button inside a group.

## Rules for you (Claude Code)
- Guide me step by step. Small steps, run and verify each one before the next.
- Never put API keys in code or chat. Use `.env` (gitignored) and `.env.example`.
- Demo data must be synthetic or consented. Only clone voices I own or have permission to use.
- Be honest when something is risky or won't fit in the time. Cut scope before cutting quality.
- Never claim a feature works until we have run it.

## Scope
MUST: upload → Prisma transcribe (diarization) → LLM translate → review screen (edit + approve, send locked until all approved) → Timbre TTS → ffmpeg time-fit + mix → download MP4 → Telegram bot (send video, pick language, get dub back).
Languages first: Hindi/English in; Kannada, Tamil, Telugu out.
STRETCH: voice cloning, all 10 languages, re-voice only edited lines, X/LinkedIn caption helper.
OUT: lip-sync, music separation (ducking only), Gnani has no translation.

## Gnani APIs (base https://api.vachana.ai, header `X-API-Key-ID: <key>`)
- STT Prisma: REST `POST /stt/v3` (<=30s); Batch `POST /stt/v3/batch/jobs` -> `/start` -> poll `GET /stt/v3/batch/jobs/{id}` -> `/files` -> `transcript_url` (segments: start_time, end_time, text, speaker_id; options with_diarization, with_denoise). Batch: 10 MB direct upload, Gujarati/Punjabi unsupported. Models prisma-v2.5 (default) / prisma-v3.0, `language_code=indic-auto` on v3.
- TTS Timbre: `POST /api/v1/tts/inference` (v3.0 = 13 voices, v2.5 = 42 voices). Voice clone: `/api/v1/tts/voice-clone/embeddings`, then inference with `model: vachana-vc-v1` + `speaker_embedding`.
- Languages: hi, en, ta, te, kn, ml, mr, bn, gu, pa (-IN).
- Verify exact request/response shapes in Gnani docs before coding; do not guess.

## Pipeline details
1. ffmpeg: extract mono 16 kHz audio.
2. Prisma batch STT with diarization -> segments.
3. LLM translate each segment (provider-agnostic module, key in .env). Keep meaning short enough to fit the time slot.
4. Review UI state: each line has text, edited flag, approved flag.
5. TTS per segment, per speaker voice.
6. Time-fit with ffmpeg `atempo` limited to 0.85-1.25; if still too long, ask LLM to shorten the line.
7. `adelay` + `amix` over original audio (duck original), mux into MP4 with `-c:v copy`.

## Tech stack
Node + Express backend, React + Vite + Tailwind frontend, ffmpeg, grammY (Telegram, long polling, ~20 MB download limit), `.env` for keys.

## UI direction (one bold screen, dark)
Colors: bg #07080C, panels #101219, lavender #A99BFF, pink #FFA6E7, peach #FFB68F, mint #6EE7B7. Font: Plus Jakarta Sans (+ Noto Sans for Indic scripts), JetBrains Mono for timestamps.
Main screen: video player (Original/Dubbed toggle, speaker orbs, waveform, subtitles) · language chips · timing-match chart · line-by-line review (Edit / Approve) · "Send to Telegram" locked until 4/4 approved · caption tabs for X and LinkedIn with copy buttons. Flow: upload -> processing (4 stages) -> ready.
If I attach a screenshot of the UI, match it.

## Telegram bot flow
User sends a video -> bot asks language (inline buttons) -> progress message -> bot returns dubbed video + "Share to group" / "Change language".

## First task
Ask me my OS and what is installed (Node, ffmpeg, git). Then set up the repo, then build the riskiest part first: one short Hindi clip through STT -> translate -> TTS -> dubbed output, using a CLI script, before any UI.
- Nov 6 (Konkani): "Konkani" (`gom`) is an EXPERIMENTAL dub target, added at the user's request (the user can review Konkani). Gnani has no Konkani voice/STT: Gemini writes Goan Konkani in Devanagari, the Marathi voice model (`mr-IN`) speaks it, so the accent is Marathi-like. Dub-into only (no Konkani source). Labelled "experimental" in the UI and bot; "Select all" skips it. Cloned voices are untested for it. Needs review by a Konkani speaker before any real use.
- Nov 7 (keep-words list): Optional "Keep these words" list per video (`job.glossary`, entries `{from,to}`; "spoken = kept" or one plain word per line; max 30 words, 60 chars each). Set on the upload screen or in the Studio (PUT /api/jobs/:id/glossary); it applies to languages dubbed AFTER it is saved. The translator is told to keep the words, shorten/lengthen steps may not drop them, and a line that still lacks one is flagged "missing: ..." (editing a line re-checks it).
