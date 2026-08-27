import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VibeDigest - AI Podcast and Video Agent",
    short_name: "VibeDigest",
    description:
      "Turn podcasts and long videos into summaries, key ideas, evidence, and source-grounded answers.",
    start_url: "/en",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#08221B",
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
