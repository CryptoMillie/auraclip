/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the static ffmpeg binary is traced into the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/clip": ["./node_modules/ffmpeg-static/**"],
    "/api/analyze": ["./node_modules/ffmpeg-static/**"],
  },
};

module.exports = nextConfig;
