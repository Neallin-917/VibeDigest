'use client'

import { useState } from 'react'
import { Video } from 'lucide-react'

/** Keep the real source image in the first screen without a broken-image fallback. */
export function TaskSourceCover({
  thumbnailUrl,
  videoUrl,
  title,
}: {
  thumbnailUrl?: string | null
  videoUrl?: string | null
  title: string
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!thumbnailUrl) return null

  const cover = failedUrl === thumbnailUrl ? (
    <div className="flex aspect-video items-center justify-center rounded-xl border border-border/70 bg-surface-raised">
      <Video className="size-8 text-muted-foreground sm:size-12" aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- task thumbnails may be hosted on arbitrary source domains.
    <img
      src={thumbnailUrl}
      alt={title}
      width={640}
      height={360}
      fetchPriority="high"
      decoding="async"
      onError={() => setFailedUrl(thumbnailUrl)}
      className="aspect-video w-full rounded-xl border border-border/70 bg-surface-raised object-cover"
    />
  )

  return videoUrl ? (
    <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
      {cover}
    </a>
  ) : cover
}
