// lib/desearch.ts — Bittensor SN22 (Desearch) optional "trend lens".
// Purpose: bias highlight ranking toward what audiences are paying attention to RIGHT NOW,
// not just intrinsic clip quality. This is the capital-rotation-of-attention idea applied to clips.
// Toggle with ENABLE_TREND_LENS — the app works fully without it.

export async function getTrendContext(topic: string): Promise<string | undefined> {
  if (process.env.ENABLE_TREND_LENS !== "true") return undefined;
  if (!process.env.DESEARCH_API_KEY) return undefined;

  try {
    const res = await fetch(
      `${process.env.DESEARCH_BASE_URL ?? "https://apis.desearch.ai"}/desearch/ai/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DESEARCH_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `What angles, takes, or framings about "${topic}" are getting the most attention on X right now? List 5 short bullet themes.`,
        }),
      }
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    // Normalize to a short text blob the LLM ranker can use. Adjust to Desearch's response shape.
    return typeof data === "string" ? data : JSON.stringify(data).slice(0, 1500);
  } catch {
    return undefined; // never let the trend lens break the core pipeline
  }
}
