"use client"

import React, { useEffect, useMemo, useRef, useState, useId } from "react"
import Image from "next/image"

type OnReady = (ctrl: { seek: (seconds: number) => void }) => void

type YTPlayer = {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  playVideo: () => void
  destroy?: () => void
}

type YTNamespace = {
  Player: new (
    elementId: string,
    options: {
      width?: string
      height?: string
      videoId: string
      host?: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (event: { target: YTPlayer }) => void
      }
    }
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null

function loadYouTubeIframeAPI(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise

  ytApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if (!existing) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      tag.async = true
      tag.onerror = () => reject(new Error("Failed to load YouTube IFrame API"))
      document.head.appendChild(tag)
    }

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try {
        if (window.YT?.Player) {
          resolve(window.YT)
          return
        }
        reject(new Error("YouTube IFrame API not ready"))
      } finally {
        // Preserve any previous handler.
        if (prev && prev !== window.onYouTubeIframeAPIReady) {
          try {
            prev()
          } catch {
            // ignore
          }
        }
      }
    }

    // Safety timeout in case the global callback never fires
    setTimeout(() => {
      if (window.YT?.Player) resolve(window.YT)
    }, 8000)
  })

  return ytApiPromise
}

export function YouTubePlayer({
  videoId,
  title,
  coverUrl,
  onReady,
}: {
  videoId: string
  title?: string
  coverUrl?: string
  onReady?: OnReady
}) {
  const id = useId()
  const containerId = useMemo(() => `yt-${videoId}-${id}`, [videoId, id])
  const playerRef = useRef<YTPlayer | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  // Track pending seek time when user clicks timestamp before player is ready
  const pendingSeekRef = useRef<number | null>(null)

  // Auto-play if no coverUrl is provided (backward compatibility / legacy behavior)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!coverUrl) setIsPlaying(true)
  }, [coverUrl])

  // Provide seek controller immediately on mount (even when in facade mode)
  // This allows users to click timestamps before the video has started playing
  useEffect(() => {
    onReady?.({
      seek: (seconds: number) => {
        const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
        if (playerRef.current && isReady) {
          // Player is ready, seek directly
          try {
            playerRef.current.seekTo(s, true)
            playerRef.current.playVideo()
          } catch {
            // ignore
          }
        } else {
          // Player not ready yet - store pending seek and trigger playback
          pendingSeekRef.current = s
          if (!isPlaying) {
            setIsPlaying(true)
          }
        }
      },
    })
  }, [onReady, isReady, isPlaying])

  useEffect(() => {
    if (!isPlaying) return

    let disposed = false

    void (async () => {
      try {
        const YT = await loadYouTubeIframeAPI()
        if (disposed) return

        // Destroy any previous player instance
        if (playerRef.current?.destroy) {
          try {
            playerRef.current.destroy()
          } catch {
            // ignore
          }
          playerRef.current = null
        }

        const player = new YT.Player(containerId, {
          width: "100%",
          height: "100%",
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            autoplay: coverUrl ? 1 : 0, // Autoplay if coming from facade click
            ...(typeof window !== "undefined" ? { origin: window.location.origin } : {}),
          },
          events: {
            onReady: () => {
              if (disposed) return
              playerRef.current = player
              setIsReady(true)
              // Handle pending seek from facade mode
              if (pendingSeekRef.current !== null) {
                try {
                  player.seekTo(pendingSeekRef.current, true)
                  player.playVideo()
                } catch {
                  // ignore
                }
                pendingSeekRef.current = null
              }
            },
          },
        })

        playerRef.current = player
      } catch {
        // If API fails, we simply stay non-seekable; parent can fall back to iframe elsewhere if desired.
      }
    })()

    return () => {
      disposed = true
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          // ignore
        }
      }
      playerRef.current = null
    }
  }, [containerId, videoId, isPlaying, coverUrl])

  if (coverUrl && !isPlaying) {
    return (
      <div
        className="overflow-hidden rounded-xl border border-white/10 bg-black/20 cursor-pointer group relative"
        onClick={() => setIsPlaying(true)}
      >
        <div className="aspect-video w-full relative">
          <Image
            src={coverUrl}
            alt={title || "Video thumbnail"}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 50vw"
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
      <div className="aspect-video w-full relative">
        <div id={containerId} className="h-full w-full" aria-label={title || "YouTube player"} />
        {!isReady && (
          <div className="absolute inset-0 bg-zinc-900/80 flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
              <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-white/40 border-b-8 border-b-transparent ml-1" />
            </div>
            <div className="w-32 h-3 rounded bg-white/10 animate-pulse" />
            <div className="w-20 h-2 rounded bg-white/5 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  )
}
