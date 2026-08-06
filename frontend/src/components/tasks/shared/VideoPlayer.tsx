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
  className,
}: VideoPlayerProps) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-surface-raised', className)}>
      <div className="relative aspect-video bg-black">
        {mediaType === 'audio' && audioUrl ? (
          <AudioEmbed
            audioUrl={audioUrl}
            coverUrl={audioCoverUrl || coverUrl}
            sourceUrl={sourceUrl || videoUrl}
            title={title}
          />
        ) : (
          <VideoEmbed videoUrl={videoUrl} title={title} />
        )}
      </div>
      <div className="px-4 py-3">
        <h3 className="truncate text-sm font-medium text-foreground">{title || 'Video source'}</h3>
      </div>
    </section>
  )
}
