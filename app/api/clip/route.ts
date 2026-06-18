// app/api/clip/route.ts — cut ONE short segment, reframe, optionally burn captions, store on Hippius.
// Because we only ever touch a 20-90s window, this is fast and light even on the Hobby plan.

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { presignDownload, putClip } from "@/lib/hippius";
import { buildSrtForWindow, type Cue } from "@/lib/transcript";

export const runtime = "nodejs";
export const maxDuration = 300;

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-500)}`))
    );
  });
}

export async function POST(req: Request) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const out = join(tmpdir(), `${id}.mp4`);
  const srtPath = join(tmpdir(), `${id}.srt`);
  let wroteSrt = false;

  try {
    const {
      sourceKey, // Hippius key of the source (uploaded)
      sourceUrl, // OR a direct file URL
      start,
      end,
      format = "vertical", // "vertical" (9:16) | "horizontal" (16:9)
      captions = false,
      cues = [],
      title = "clip",
    } = await req.json();

    const input = sourceUrl ?? (sourceKey ? await presignDownload(sourceKey) : null);
    if (!input) return NextResponse.json({ error: "No source" }, { status: 400 });

    const dur = Math.max(1, Number(end) - Number(start));

    // -ss BEFORE -i = fast seek via HTTP range; we read only the bytes for this window.
    const base = ["-ss", String(start), "-i", input, "-t", String(dur)];

    let vf: string[] = [];
    if (format === "vertical") {
      // Center crop to 9:16, scale to 1080x1920. (v2: speaker-tracking crop — see README.)
      vf.push("crop=ih*9/16:ih:(iw-ih*9/16)/2:0", "scale=1080:1920");
    }

    if (captions && (cues as Cue[]).length) {
      const srt = buildSrtForWindow(cues as Cue[], Number(start), Number(end));
      await writeFile(srtPath, srt);
      wroteSrt = true;
      // Escape path for the subtitles filter.
      const esc = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      vf.push(
        `subtitles=${esc}:force_style='Fontsize=18,Bold=1,Alignment=2,MarginV=60,Outline=2'`
      );
    }

    const args =
      vf.length === 0
        ? // Horizontal, no captions = pure stream copy = near-instant, zero re-encode.
          [...base, "-c", "copy", "-movflags", "+faststart", out]
        : [
            ...base,
            "-vf",
            vf.join(","),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            out,
          ];

    await run(args);

    const key = `clips/${id}-${title.replace(/[^\w.-]/g, "_").slice(0, 40)}.mp4`;
    const clipUrl = await putClip(out, key);

    return NextResponse.json({ clipUrl, key });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "clip failed" }, { status: 500 });
  } finally {
    unlink(out).catch(() => {});
    if (wroteSrt) unlink(srtPath).catch(() => {});
  }
}
