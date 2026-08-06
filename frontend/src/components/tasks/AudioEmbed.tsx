'use client'

import NextImage from 'next/image'

import { ApplePodcastsIcon } from '@/components/icons/ApplePodcastsIcon'
import { XiaoyuzhouIcon } from '@/components/icons/XiaoyuzhouIcon'
import { Heading } from '@/components/ui/typography'

export function AudioEmbed({
  audioUrl,
  title,
  coverUrl,
  sourceUrl,
}: {
  audioUrl: string
  title?: string
  coverUrl?: string
  sourceUrl?: string
}) {
  const isXiaoyuzhou = sourceUrl?.includes('xiaoyuzhoufm.com')
  const isApple = sourceUrl?.includes('apple.com')

  return (
    <div className="h-full overflow-hidden bg-black/20">
      <div className="flex h-full flex-col md:flex-row">
        {coverUrl ? (
          <div className="relative aspect-square shrink-0 overflow-hidden bg-black/40 md:w-64">
            <NextImage
              src={coverUrl}
              alt={title || 'Audio cover'}
              fill
              className="object-cover"
              referrerPolicy="no-referrer"
              sizes="(max-width: 768px) 100vw, 256px"
            />
          </div>
        ) : null}

        <div className="flex flex-1 flex-col justify-between gap-4 p-4 md:p-6">
          <div>
            {isXiaoyuzhou ? (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-xiaoyuzhou">
                <XiaoyuzhouIcon className="size-4 text-xiaoyuzhou" />
                Xiaoyuzhou
              </div>
            ) : null}
            {isApple ? (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-apple">
                <ApplePodcastsIcon className="size-4" />
                Apple Podcasts
              </div>
            ) : null}
            <Heading as="h3" variant="mediaTitle" className="mb-2">
              {title || 'Episode'}
            </Heading>
          </div>

          <audio className="w-full" controls preload="none">
            <source src={audioUrl} />
            Your browser does not support the audio element.
          </audio>
        </div>
      </div>
    </div>
  )
}
