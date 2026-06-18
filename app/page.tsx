"use client";

import { useState } from "react";

type Highlight = {
  start: number;
  end: number;
  title: string;
  hook: string;
  score: number;
  reason: string;
};

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Server returned ${res.status} with no body`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200));
  }
}

const card: React.CSSProperties = {
  background: "#141417",
  border: "1px solid #26262b",
  borderRadius: 12,
  padding: 16,
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function Page() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [format, setFormat] = useState<"vertical" | "horizontal">("vertical");
  const [captions, setCaptions] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [cues, setCues] = useState<any[]>([]);
  const [clips, setClips] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy("Uploading to Hippius…");
    setError(null);
    try {
      const r = await fetch("/api/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      }).then(safeJson);
      await fetch(r.uploadUrl, { method: "PUT", body: file });
      setSourceKey(r.key);
      setYoutubeUrl("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    setBusy("Finding the best moments…");
    setError(null);
    setClips({});
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ youtubeUrl: youtubeUrl || undefined, sourceKey }),
      }).then(safeJson);
      if (r.code === "OVER_LIMIT") {
        // ── MONETIZATION SEAM ──────────────────────────────────────────────
        // Today: just inform. Later: swap this for an upgrade prompt / checkout.
        // No backend change needed — the cap already lives in MAX_SOURCE_MINUTES.
        setError(
          `${r.error} Longer videos are coming as a paid tier — for now keep it under ${r.limitMinutes} min.`
        );
        return;
      }
      if (r.error) throw new Error(r.error);
      setHighlights(r.highlights ?? []);
      setCues(r.cues ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function makeClip(h: Highlight, i: number) {
    setBusy(`Cutting "${h.title}"…`);
    setError(null);
    try {
      const r = await fetch("/api/clip", {
        method: "POST",
        body: JSON.stringify({
          sourceKey,
          sourceUrl: youtubeUrl || undefined, // note: direct YT cutting is fragile — see README
          start: h.start,
          end: h.end,
          format,
          captions,
          cues,
          title: h.title,
        }),
      }).then(safeJson);
      if (r.error) throw new Error(r.error);
      setClips((c) => ({ ...c, [i]: r.clipUrl }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const canAnalyze = !!youtubeUrl || !!sourceKey;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 96px" }}>
      <h1 style={{ fontSize: 34, margin: "0 0 4px", letterSpacing: -0.5 }}>
        AuraClip ✂️
      </h1>
      <p style={{ color: "#8a8a92", margin: "0 0 28px" }}>
        Long-form in → best moments out. Inference on Chutes (SN64), storage on
        Hippius (SN75).
      </p>

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "#8a8a92" }}>Paste a YouTube URL</label>
        <input
          value={youtubeUrl}
          onChange={(e) => {
            setYoutubeUrl(e.target.value);
            setSourceKey(null);
          }}
          placeholder="https://youtube.com/watch?v=…"
          style={{
            width: "100%",
            marginTop: 6,
            padding: "10px 12px",
            background: "#0a0a0b",
            border: "1px solid #2c2c33",
            borderRadius: 8,
            color: "#e8e8ea",
            boxSizing: "border-box",
          }}
        />
        <div style={{ textAlign: "center", color: "#55555c", margin: "12px 0", fontSize: 13 }}>
          — or —
        </div>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          style={{ color: "#8a8a92", fontSize: 14 }}
        />
        {sourceKey && (
          <p style={{ color: "#5edc96", fontSize: 13, margin: "8px 0 0" }}>
            ✓ uploaded to Hippius
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["vertical", "horizontal"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #2c2c33",
                background: format === f ? "#e8e8ea" : "#141417",
                color: format === f ? "#0a0a0b" : "#e8e8ea",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {f === "vertical" ? "9:16 Vertical" : "16:9 Horizontal"}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#b8b8be", fontSize: 14 }}>
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
          Burn captions
        </label>
        <button
          onClick={analyze}
          disabled={!canAnalyze || !!busy}
          style={{
            marginLeft: "auto",
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: canAnalyze ? "#7c5cff" : "#2c2c33",
            color: "#fff",
            fontWeight: 700,
            cursor: canAnalyze ? "pointer" : "not-allowed",
          }}
        >
          Find highlights
        </button>
      </div>

      {busy && <p style={{ color: "#7c5cff" }}>{busy}</p>}
      {error && <p style={{ color: "#ff6b6b" }}>⚠ {error}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {highlights.map((h, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong style={{ fontSize: 16 }}>{h.title}</strong>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: h.score >= 75 ? "#5edc96" : "#d8b24a",
                  whiteSpace: "nowrap",
                }}
              >
                {h.score}/100
              </span>
            </div>
            <p style={{ color: "#a8a8b0", fontSize: 14, margin: "8px 0" }}>“{h.hook}”</p>
            <p style={{ color: "#6f6f78", fontSize: 13, margin: "0 0 12px" }}>{h.reason}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#6f6f78", fontSize: 13 }}>
                {fmt(h.start)}–{fmt(h.end)} ({Math.round(h.end - h.start)}s)
              </span>
              {clips[i] ? (
                <a
                  href={clips[i]}
                  target="_blank"
                  style={{ color: "#5edc96", fontWeight: 600, marginLeft: "auto" }}
                >
                  ↓ Download clip
                </a>
              ) : (
                <button
                  onClick={() => makeClip(h, i)}
                  disabled={!!busy}
                  style={{
                    marginLeft: "auto",
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid #2c2c33",
                    background: "#1d1d22",
                    color: "#e8e8ea",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Clip it
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
