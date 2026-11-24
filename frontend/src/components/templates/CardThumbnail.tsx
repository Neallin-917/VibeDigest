'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'

type CardThumbnailProps = Omit<ImageProps, 'src'> & { src: string }

// Only substitute a standard video cover. Signed URLs and custom frames must
// keep their original identity.
const youtubeCover = /^(https:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/[A-Za-z0-9_-]{11}\/)(?:maxresdefault|sddefault|hqdefault|mqdefault)\.jpg$/

export function CardThumbnail({ src, onError, ...props }: CardThumbnailProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const match = youtubeCover.exec(src)
  const direct = match && failedSource !== src

  return (
    <Image
      {...props}
      alt={props.alt}
      src={direct ? match[1] + 'mqdefault.jpg' : src}
      unoptimized={Boolean(direct)}
      onError={direct ? () => setFailedSource(src) : onError}
    />
  )
}
