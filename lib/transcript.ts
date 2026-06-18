// lib/transcript.ts — get a timestamped transcript cheaply, and slice SRTs for burned captions.

import { YoutubeTranscript } from "youtube-transcript";

export type Cue = { start: number; dur: number; text: string };

// Free path: YouTube already has timestamped captions. No transcription cost at all.
export async function fetchYoutubeTranscript(
  url: string
): Promise<{ cues: Cue[]; flat: string }> {
  const items = await YoutubeTranscript.fetchTranscript(url);
  const cues: Cue[] = items.map((i) => ({
    start: i.offset / 1000,
    dur: i.duration / 1000,
    text: i.text.replace(/\s+/g, " ").trim(),
  }));
  const flat = cues.map((c) => `[${c.start.toFixed(1)}] ${c.text}`).join("\n");
  return { cues, flat };
}

function srtTime(s: number): string {
  const ms = Math.floor((s % 1) * 1000);
  const total = Math.floor(s);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms).padStart(3, "0")}`;
}

// Build an SRT for a clip window, with timestamps rebased to 0 = clip start.
export function buildSrtForWindow(cues: Cue[], start: number, end: number): string {
  const within = cues.filter((c) => c.start < end && c.start + c.dur > start);
  return within
    .map((c, i) => {
      const cs = Math.max(0, c.start - start);
      const ce = Math.min(end - start, c.start + c.dur - start);
      return `${i + 1}\n${srtTime(cs)} --> ${srtTime(ce)}\n${c.text}\n`;
    })
    .join("\n");
}
