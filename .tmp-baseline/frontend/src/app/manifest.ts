import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VibeDigest - AI Video Summarizer & Transcriber",
    short_name: "VibeDigest",
    description:
      "Free AI Video Summarizer & YouTube to Text Converter. Get instant summaries, transcripts, and structured notes from YouTube videos.",
    start_url: "/en",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10b981",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
