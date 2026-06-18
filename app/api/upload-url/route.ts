// app/api/upload-url/route.ts — mint a presigned URL so the browser uploads
// the source video straight to Hippius (never through this function).

import { NextResponse } from "next/server";
import { presignUpload } from "@/lib/hippius";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();
    const key = `sources/${Date.now()}-${(filename ?? "video").replace(/[^\w.-]/g, "_")}`;
    const { url } = await presignUpload(key, contentType ?? "video/mp4");
    return NextResponse.json({ uploadUrl: url, key });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "upload-url failed" },
      { status: 500 }
    );
  }
}
