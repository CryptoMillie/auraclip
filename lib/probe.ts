// lib/probe.ts — read a source's duration cheaply (reads only the file header via range request).
// Reuses the ffmpeg binary we already bundle, so no extra dependency.

import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export function probeDurationSeconds(input: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath as string, ["-i", input], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    // ffmpeg exits non-zero when no output is given, but still prints Duration. Ignore the code.
    p.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
    p.on("error", () => resolve(null));
  });
}
