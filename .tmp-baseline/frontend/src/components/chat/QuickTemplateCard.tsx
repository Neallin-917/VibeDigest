'use client'

import Image from 'next/image'
import { PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickTemplateCardProps {
  task: {
    id: string
    video_url: string
    video_title?: string
    thumbnail_url?: string
  }
  onSelect: (taskId: string) => void
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

export function QuickTemplateCard({ task, onSelect }: QuickTemplateCardProps) {
  const platform = getPlatformFromUrl(task.video_url)

  return (
    <button
      onClick={() => onSelect(task.id)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300 text-left",
        "bg-white/60 border-slate-200/80 hover:border-slate-300 hover:bg-white hover:shadow-lg hover:scale-[1.02]",
        "dark:bg-white/[0.03] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.06]",
        "w-full" // Grid-friendly: fill container width
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-black/40">
        {task.thumbnail_url ? (
          <Image
            src={task.thumbnail_url}
            alt={task.video_title || "Video thumbnail"}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PlayCircle className="h-8 w-8 text-slate-400" />
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Platform Badge */}
        <span className={cn(
          "hidden @md:block absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md",
          "bg-white/80 text-slate-700 border border-slate-200/50",
          "dark:bg-black/60 dark:text-white/80 dark:border-white/10"
        )}>
          {platform}
        </span>
      </div>

      {/* Title */}
      <div className="hidden @md:block p-3">
        <h4 className="text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
          {task.video_title || 'Untitled'}
        </h4>
      </div>
    </button>
  )
}
