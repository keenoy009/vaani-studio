# Vaani Studio — project brief (read this first)

## What this is
A dubbing studio for Indian languages. User uploads a Hindi/English video → we transcribe with speaker separation → translate → a HUMAN reviews/edits/approves every line → we voice each line (cloned or studio voice) → time-fit + mix → dubbed MP4. A Telegram bot delivers results to groups (health workers, farmers, students).
Built for the Gnani AI "Great Indian AI Internship Challenge". Deadline: Nov 10 2026, 11:59 PM IST. I (the user) am a student; explain every step in plain language, tell me exactly which file to create and which command to run.

## Decisions that changed the brief (newest wins)
- Nov 5: The user REMOVED the approval gate. No approve buttons; clicking a language translates + voices + mixes automatically. Lines stay editable, then "Re-render". Too-long machine translations are auto-shortened (user-edited lines never are). Voice per speaker is chosen on the studio page. Original audio is fully muted (volume 0): only the dub is heard. "Send to Telegram" now only needs a finished, up-to-date dub.

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
