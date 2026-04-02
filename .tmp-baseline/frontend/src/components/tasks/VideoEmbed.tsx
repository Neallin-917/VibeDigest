"use client"

import React, { useEffect, useState } from "react"
import Image from "next/image"

import { YouTubePlayer } from "@/components/tasks/YouTubePlayer"

type OnReady = (ctrl: { seek: (seconds: number) => void }) => void

function getBilibiliVideoId(inputUrl: string): { bvid?: string; aid?: string; page?: string } | null {
  try {
    const url = new URL(inputUrl)
    const host = url.hostname.replace(/^www\./, "")

    // Handle already-embedded URLs like:
    // https://player.bilibili.com/player.html?bvid=BV...&page=1
    if (host === "player.bilibili.com") {
      const bvid = url.searchParams.get("bvid") || undefined
      const aid = url.searchParams.get("aid") || undefined
      const page = url.searchParams.get("page") || undefined
      if (!bvid && !aid) return null
      return { bvid, aid, page }
    }

    // Standard bilibili video URLs:
    // https://www.bilibili.com/video/BV...
    // https://www.bilibili.com/video/av123456
    if (host.endsWith("bilibili.com")) {
      const parts = url.pathname.split("/").filter(Boolean)
      const videoIdx = parts.indexOf("video")
      if (videoIdx !== -1 && parts.length > videoIdx + 1) {
        const id = parts[videoIdx + 1]
        const page = url.searchParams.get("p") || undefined
        if (/^BV/i.test(id)) return { bvid: id, page }
        if (/^av\d+$/i.test(id)) return { aid: id.replace(/^av/i, ""), page }
      }
    }

    // b23.tv short links are redirects; we can't reliably expand them client-side due to CORS.
    // Keep it as "no embed" and fall back to the external link UI.
    return null
  } catch {
    return null
  }
}

function getYouTubeVideoId(inputUrl: string): string | null {
  try {
    const url = new URL(inputUrl)
    const host = url.hostname.replace(/^www\./, "")

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0]
      return id || null
    }

    // youtube.com/* variants
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      // /watch?v=<id>
      const v = url.searchParams.get("v")
      if (v) return v

      // /embed/<id>, /shorts/<id>, /live/<id>
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length >= 2 && ["embed", "shorts", "live"].includes(parts[0])) {
        return parts[1] || null
      }
    }

    return null
  } catch {
    return null
  }
}

export function supportsVideoEmbed(videoUrl: string): boolean {
  const bilibili = getBilibiliVideoId(videoUrl)
  if (bilibili?.bvid || bilibili?.aid) return true
  return Boolean(getYouTubeVideoId(videoUrl))
}

export function VideoEmbed({
  videoUrl,
  title,
  coverUrl,
  onReady,
}: {
  videoUrl: string
  title?: string
  coverUrl?: string
  onReady?: OnReady
}) {
  const bilibili = getBilibiliVideoId(videoUrl)
  if (bilibili?.bvid || bilibili?.aid) return <BilibiliPlayer bilibili={bilibili} title={title} coverUrl={coverUrl} onReady={onReady} />

  const youtubeId = getYouTubeVideoId(videoUrl)
  if (!youtubeId) return null

  // Use IFrame Player API for seek support.
  return <YouTubePlayer videoId={youtubeId} title={title} coverUrl={coverUrl} onReady={onReady} />
}

function BilibiliPlayer({
  bilibili,
  title,
  coverUrl,
  onReady,
}: {
  bilibili: { bvid?: string; aid?: string; page?: string }
  title?: string
  coverUrl?: string
  onReady?: OnReady
}) {
  // Bilibili does not provide a stable public JS API for iframe embeds.
  // Best-effort seek: reload iframe with a `t=` parameter (seconds). If unsupported, UX remains unchanged.
  const [seekSeconds, setSeekSeconds] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    onReady?.({
      seek: (seconds: number) => {
        const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
        setSeekSeconds(s)
      },
    })
    // We only register the controller once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const params = new URLSearchParams()
  if (bilibili.bvid) params.set("bvid", bilibili.bvid)
  if (bilibili.aid) params.set("aid", bilibili.aid)
  if (bilibili.page) params.set("page", bilibili.page)
  params.set("high_quality", "1")
  params.set("danmaku", "0")
  if (seekSeconds !== null) {
    params.set("t", String(seekSeconds))
    params.set("autoplay", "1")
  }

  const src = `https://player.bilibili.com/player.html?${params.toString()}`
  const iframeKey = seekSeconds === null ? "bili-base" : `bili-t-${seekSeconds}`

  // Facade Mode
  if (coverUrl && !isPlaying && seekSeconds === null) {
    // Ensure cover URL uses HTTPS to avoid "next/image" mixed content errors
    const safeCoverUrl = coverUrl.startsWith("http://") 
      ? coverUrl.replace("http://", "https://") 
      : coverUrl

    return (
      <div
        className="overflow-hidden rounded-xl border border-white/10 bg-black/20 cursor-pointer group relative"
        onClick={() => setIsPlaying(true)}
      >
        <div className="aspect-video w-full relative">
          <Image
            src={safeCoverUrl}
            alt={title || "Video thumbnail"}
            fill
            className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            unoptimized={false}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-white fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="aspect-video w-full">
        <iframe
          className="h-full w-full"
          src={src}
          title={title || "Embedded video player"}
          loading="lazy"
          allow="fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          key={iframeKey}
        />
      </div>
    </div>
  )
}


