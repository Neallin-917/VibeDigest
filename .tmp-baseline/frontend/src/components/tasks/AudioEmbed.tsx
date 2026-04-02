"use client"

import React, { useEffect, useRef } from "react"
import NextImage from "next/image"

import { ApplePodcastsIcon } from "@/components/icons/ApplePodcastsIcon"
import { XiaoyuzhouIcon } from "@/components/icons/XiaoyuzhouIcon"
import { Heading } from "@/components/ui/typography"

export function AudioEmbed({
  audioUrl,
  title,
  coverUrl,
  sourceUrl,
  onReady,
}: {
  audioUrl: string
  title?: string
  coverUrl?: string
  sourceUrl?: string
  onReady?: (ctrl: { seek: (seconds: number) => void }) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!audioUrl || !onReady) return
    onReady({
      seek: (seconds: number) => {
        const audio = audioRef.current
        if (!audio) return
        const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0)

        try {
          const p = audio.play()
          if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => { })
        } catch {
          // ignore
        }

        const apply = () => {
          try {
            audio.currentTime = s
          } catch {
            // ignore
          }
          try {
            const p = audio.play()
            if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => { })
          } catch {
            // ignore
          }
        }

        if (audio.readyState >= 1) {
          apply()
          return
        }

        try {
          audio.load()
        } catch {
          // ignore
        }
        audio.addEventListener("loadedmetadata", apply, { once: true })
      },
    })
  }, [audioUrl, onReady])

  if (!audioUrl) return null

  const isXiaoyuzhou = sourceUrl?.includes("xiaoyuzhoufm.com")
  const isApple = sourceUrl?.includes("apple.com")

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="flex flex-col md:flex-row">
        {coverUrl ? (
          <div className="relative shrink-0 md:w-64 aspect-square bg-black/40 overflow-hidden">
            <NextImage
              src={coverUrl}
              alt={title || "Audio cover"}
              fill
              className="object-cover"
              referrerPolicy="no-referrer"
              sizes="(max-width: 768px) 100vw, 256px"
            />
          </div>
        ) : null}

        <div className="flex-1 flex flex-col justify-between p-4 md:p-6 gap-4">
          <div>
            {isXiaoyuzhou && (
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-xiaoyuzhou uppercase mb-2">
                <XiaoyuzhouIcon className="w-4 h-4 text-xiaoyuzhou" />
                Xiaoyuzhou
              </div>
            )}
            {isApple && (
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-apple uppercase mb-2">
                <ApplePodcastsIcon className="w-4 h-4" />
                Apple Podcasts
              </div>
            )}

            <Heading as="h3" variant="mediaTitle" className="mb-2">
              {title || "Episode"}
            </Heading>
            {/* Optional: Add date or "Podcast" subtitle if available in data */}
          </div>

          <div className="w-full">
            <audio ref={audioRef} className="w-full" controls preload="none">
              <source src={audioUrl} />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      </div>
    </div>
  )
}


