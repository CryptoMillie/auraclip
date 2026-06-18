// lib/hippius.ts — Bittensor SN75 (Hippius) S3-compatible storage adapter.
// Hippius speaks the S3 API, so the standard AWS SDK works — just point it at Hippius.
// The win vs AWS: no egress fees, which is the thing that normally kills video apps.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile } from "node:fs/promises";

const bucket = () => process.env.HIPPIUS_BUCKET ?? "auraclip";

let _s3: S3Client | null = null;
function s3() {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.HIPPIUS_REGION ?? "decentralized",
      endpoint: process.env.HIPPIUS_S3_ENDPOINT ?? "https://s3.hippius.com",
      credentials: {
        accessKeyId: process.env.HIPPIUS_ACCESS_KEY!,
        secretAccessKey: process.env.HIPPIUS_SECRET_KEY!,
      },
      forcePathStyle: true, // required by most S3-compatible providers
    });
  }
  return _s3;
}

// Mint a URL the browser PUTs the raw source file to — keeps multi-GB video off Vercel.
export async function presignUpload(key: string, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3(), cmd, { expiresIn: 3600 });
  return { url, key };
}

// Time-limited read URL. ffmpeg seeks into this with HTTP range requests — no full download.
export async function presignDownload(key: string, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(s3(), cmd, { expiresIn });
}

// Push a finished clip (from /tmp) up to Hippius and return a shareable read URL.
export async function putClip(localPath: string, key: string) {
  const body = await readFile(localPath);
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: "video/mp4",
    })
  );
  return presignDownload(key, 60 * 60 * 24 * 7); // 7-day link
}
