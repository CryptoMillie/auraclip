// app/api/analyze/route.ts — transcript → (optional trend lens) → Chutes highlight ranking.
// I/O-bound (just calling subnets), so it fits comfortably in one function call for most podcasts.

import { NextResponse } from "next/server";
import { rankHighlights, transcribeAudio } from "@/lib/chutes";
import { getTrendContext } from "@/lib/desearch";
import { fetchYoutubeTranscript, type Cue } from "@/lib/transcript";
import { presignDownload } from "@/lib/hippius";
import { probeDurationSeconds } from "@/lib/probe";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { youtubeUrl, sourceKey, topic, maxClips } = await req.json();

    const capMin = Number(process.env.MAX_SOURCE_MINUTES ?? 20);
    const capSec = capMin * 60;
    const overLimit = (actualSec: number) =>
      NextResponse.json(
        {
          code: "OVER_LIMIT",
          error: `This video is ~${Math.round(actualSec / 60)} min. The current limit is ${capMin} min.`,
          limitMinutes: capMin,
          actualMinutes: Math.round(actualSec / 60),
        },
        { status: 413 }
      );

    let flat = "";
    let cues: Cue[] = [];

    if (youtubeUrl) {
      // Cheap path: reuse existing captions, skip transcription entirely.
      const t = await fetchYoutubeTranscript(youtubeUrl);
      flat = t.flat;
      cues = t.cues;
      // Caption span ≈ video length — enforce the cap for free, before any model call.
      const span = cues.length ? cues[cues.length - 1].start + cues[cues.length - 1].dur : 0;
      if (span > capSec) return overLimit(span);
    } else if (sourceKey) {
      // Uploaded file: probe duration first (reads only the header), THEN transcribe.
      const audioUrl = await presignDownload(sourceKey);
      const dur = await probeDurationSeconds(audioUrl);
      if (dur !== null && dur > capSec) return overLimit(dur);
      flat = await transcribeAudio(audioUrl);
    } else {
      return NextResponse.json(
        { error: "Provide youtubeUrl or sourceKey" },
        { status: 400 }
      );
    }

    if (!flat.trim()) {
      return NextResponse.json({ error: "Empty transcript" }, { status: 422 });
    }

    const trendContext = await getTrendContext(topic ?? "this episode");
    const highlights = await rankHighlights(flat, { maxClips, trendContext });

    return NextResponse.json({ highlights, cues });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "analyze failed" },
      { status: 500 }
    );
  }
}
