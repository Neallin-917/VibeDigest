'use client'

import { VideoEmbed } from '@/components/tasks/VideoEmbed'
import { AudioEmbed } from '@/components/tasks/AudioEmbed'
import { cn } from '@/lib/utils'

interface VideoPlayerProps {
  mediaType: 'video' | 'audio'
  videoUrl: string
  title?: string
  coverUrl?: string
  audioUrl?: string | null
  audioCoverUrl?: string
  sourceUrl?: string
  onMediaReady?: (ctrl: { seek: (seconds: number) => void }) => void
  className?: string
}

export function VideoPlayer({
  mediaType,
  videoUrl,
  title,
  coverUrl,
  audioUrl,
  audioCoverUrl,
  sourceUrl,
  onMediaReady,
  className
}: VideoPlayerProps) {
  return (
    <div className={cn(
      "glass-panel rounded-[24px] p-2 transition-all hover:shadow-lg backdrop-blur-xl border shadow-sm",
      // Light Mode
      "bg-white/65 border-white/50",
      // Dark Mode
      "dark:bg-black/40 dark:border-white/10",
      className
    )}>
      <div className="relative aspect-video rounded-[20px] overflow-hidden shadow-inner bg-black">
        {mediaType === 'audio' && audioUrl ? (
          <AudioEmbed 
            audioUrl={audioUrl}
            coverUrl={audioCoverUrl || coverUrl}
            sourceUrl={sourceUrl || videoUrl}
            title={title}
            onReady={onMediaReady}
          />
        ) : (
          <VideoEmbed 
            videoUrl={videoUrl}
            title={title}
            coverUrl={coverUrl}
            onReady={onMediaReady}
          />
        )}
      </div>
      
      {/* Title & Metadata */}
      <div className="px-2 pt-3 pb-1">
        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 line-clamp-1">
          {title || "Loading..."}
        </h4>
      </div>
    </div>
  )
}
