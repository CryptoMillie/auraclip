// lib/chutes.ts — Bittensor SN64 (Chutes) inference adapter.
// Everything that needs a GPU/model lives here. Swap this file to change providers.

import OpenAI from "openai";

let _chutes: OpenAI | null = null;
function chutes() {
  if (!_chutes) {
    _chutes = new OpenAI({
      apiKey: process.env.CHUTES_API_KEY!,
      baseURL: process.env.CHUTES_BASE_URL ?? "https://llm.chutes.ai/v1",
    });
  }
  return _chutes;
}

export type Highlight = {
  start: number; // seconds
  end: number; // seconds
  title: string; // punchy clip title / hook text
  hook: string; // the opening line that grabs attention
  score: number; // 0-100 virality/quality score
  reason: string; // why this moment clips well
};

// The actual "secret sauce": clip-virality heuristics encoded as a prompt.
const SYSTEM_PROMPT = `You are a senior short-form video producer who has cut thousands of
viral clips from long-form podcasts. You receive a timestamped transcript and return the
strongest standalone moments to clip.

A great clip:
- Has a HOOK in the first 3 seconds (a bold claim, a question, a surprising number, tension).
- Is SELF-CONTAINED — it makes sense to someone who never heard the rest of the episode.
- Delivers a PAYOFF: a clean insight, a contrarian take, an emotional spike, or a story beat.
- Runs 20-90 seconds. Trim dead air, throat-clearing, and "um, so, like" lead-ins.
- Starts on a complete sentence, ends on a complete thought.

Score each 0-100 on likely shareability. Prefer fewer, stronger clips over many mediocre ones.

Return ONLY valid JSON, no prose, no markdown fences:
{ "highlights": [ { "start": number, "end": number, "title": string, "hook": string, "score": number, "reason": string } ] }
Timestamps are seconds (decimals ok) relative to the start of the source video.`;

export async function rankHighlights(
  transcript: string,
  opts: { maxClips?: number; trendContext?: string } = {}
): Promise<Highlight[]> {
  const max = opts.maxClips ?? 8;
  const trend = opts.trendContext
    ? `\n\nCURRENT TRENDING ANGLES (bias scoring toward moments that intersect these — this is what audiences are paying attention to right now):\n${opts.trendContext}`
    : "";

  const res = await chutes().chat.completions.create({
    model: process.env.CHUTES_LLM_MODEL ?? "deepseek-ai/DeepSeek-V3",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Return up to ${max} highlights.${trend}\n\nTRANSCRIPT:\n${transcript}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { highlights?: Highlight[] };
  return (parsed.highlights ?? [])
    .filter((h) => h.end > h.start && h.end - h.start <= 120)
    .sort((a, b) => b.score - a.score);
}

// Only used when there are no existing captions (e.g. a raw uploaded file).
// For long files this can exceed a single Vercel call — see README for the Chutes-container path.
export async function transcribeAudio(audioUrl: string): Promise<string> {
  const url = process.env.CHUTES_WHISPER_URL;
  if (!url) throw new Error("CHUTES_WHISPER_URL not set");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CHUTES_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio_url: audioUrl, timestamps: true }),
  });
  if (!res.ok) throw new Error(`Chutes transcription failed: ${res.status}`);
  const data = await res.json();
  // Normalize to a flat timestamped transcript string. Adjust to your chute's response shape.
  if (typeof data.text === "string") return data.text;
  if (Array.isArray(data.segments)) {
    return data.segments
      .map((s: any) => `[${s.start.toFixed(1)}] ${s.text.trim()}`)
      .join("\n");
  }
  return JSON.stringify(data);
}
