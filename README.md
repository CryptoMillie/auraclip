# AuraClip ✂️

A minimal, Bittensor-native auto-clipper. Drop in a long-form video → AI finds the
best moments → cut them into horizontal (16:9) or vertical (9:16) clips.

**The whole AI/storage stack runs on Bittensor subnets:**

| Job | Subnet | Why |
|-----|--------|-----|
| Inference (find highlights + transcribe) | **Chutes (SN64)** | OpenAI-compatible API, ~90% cheaper than centralized, runs open models |
| Storage (source + finished clips) | **Hippius (SN75)** | S3-compatible, **no egress fees** (the thing that kills video-app margins) |
| Trend lens (optional ranking boost) | **Desearch (SN22)** | rank clips by what's *currently* getting attention, not just intrinsic quality |

---

## The one rule that shapes the whole design

**Never pipe the full video through a Vercel function.** Vercel functions cap at
~4.5 MB request bodies and 300s execution. A 2-hour podcast is multiple GB. So:

1. The browser uploads the source **directly to Hippius** via a presigned URL (Vercel only mints the URL).
2. We **prefer captions over transcription** — if it's a YouTube URL, we pull the existing
   timestamped transcript for free and skip the heavy Whisper step entirely.
3. We **only ever cut short segments** (20–90s). Cutting a 60s clip is near-instant and fits
   easily inside a single function call. We never transcode the whole file.

This is what makes "runs on Vercel, simple, cheap" actually true.

## Pipeline

```
Browser ──paste URL / upload──▶ Hippius (source)
   │
   ▼
/api/analyze   (I/O-bound, fits in 300s)
   ├─ get transcript:  YouTube captions  OR  Chutes Whisper on uploaded audio
   ├─ (optional) Desearch: pull trending angles for the topic
   └─ Chutes LLM: rank highlights ▶ [{start,end,title,hook,score,reason}]
   │
   ▼
Browser shows highlight cards → user picks clips + format (16:9 / 9:16) + captions on/off
   │
   ▼
/api/clip   (per clip, short → trivial)
   ├─ ffmpeg: seek + cut segment from Hippius source (range-read, no full download)
   ├─ 16:9 = stream copy (instant) | 9:16 = crop/pad to 1080x1920 (+ optional burned SRT)
   └─ upload finished clip ▶ Hippius
   │
   ▼
Browser: preview + download link
```

## Adapter pattern (important risk mitigation)

These subnets are young — APIs shift, uptime isn't AWS-grade yet. Every subnet call lives
behind an adapter in `/lib` (`chutes.ts`, `hippius.ts`, `desearch.ts`). If a subnet is down
or its API changes, you swap one file — the app doesn't care. Build the moat, but don't
hard-couple to it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your 3 API keys + confirm base URLs/model slugs
npm run dev
```

Then deploy: `vercel --prod` (set the same env vars in the Vercel dashboard).

> ⚠️ Confirm the exact base URLs and model slugs in your Chutes + Hippius dashboards.
> They're all env vars so you never touch code to change them.

## Roadmap (the "make it pop" layer — v2+)

- **Active-speaker tracking** for vertical: detect the speaking face per keyframe, move the
  crop window to follow it (this is what Opus Clip charges for). Approach: sample keyframes →
  face detection → smoothed crop path → ffmpeg `crop` with a per-frame expression.
- **Move the cutter to a Chutes container** so even the ffmpeg work is on-Bittensor and scales.
- **Auto B-roll / captions styling**, virality score calibration, batch export.
