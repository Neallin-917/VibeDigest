'use client'

import Image from 'next/image'
import { PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatExample } from '@/lib/chat-examples'

interface QuickTemplateCardProps {
  task: ChatExample
  onSelect: (task: ChatExample) => void
  highPriorityThumbnail?: boolean
}

// Get platform name from URL
function getPlatformFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('bilibili')) return 'Bilibili'
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'YouTube'
    if (hostname.includes('apple.com')) return 'Podcast'
    if (hostname.includes('xiaoyuzhoufm.com')) return 'Xiaoyuzhou'
    return 'Web'
  } catch {
    return 'Link'
  }
}

export function QuickTemplateCard({
  task,
  onSelect,
  highPriorityThumbnail = false,
}: QuickTemplateCardProps) {
  const platform = getPlatformFromUrl(task.video_url)

  return (
    <button
      onClick={() => onSelect(task)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300 text-left",
        "border-border/80 bg-card/70 hover:scale-[1.02] hover:border-border-strong hover:bg-card hover:shadow-lg",
        "w-full" // Grid-friendly: fill container width
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-surface-subtle">
        {task.thumbnail_url ? (
          <Image
            src={task.thumbnail_url}
            alt={task.video_title || "Video thumbnail"}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading={highPriorityThumbnail ? 'eager' : 'lazy'}
            fetchPriority={highPriorityThumbnail ? 'high' : 'auto'}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PlayCircle className="h-8 w-8 text-foreground-subtle" />
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Platform Badge */}
        <span className={cn(
          "hidden @md:block absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md",
          "border border-border/60 bg-card/85 text-foreground-soft"
        )}>
          {platform}
        </span>
      </div>

      {/* Title */}
      <div className="hidden @md:block p-3">
        <h4 className="line-clamp-2 text-xs font-medium leading-snug text-foreground-soft">
          {task.video_title || 'Untitled'}
        </h4>
      </div>
    </button>
  )
}
