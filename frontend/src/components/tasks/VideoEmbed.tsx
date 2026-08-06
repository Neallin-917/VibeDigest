'use client'

function getBilibiliVideoId(inputUrl: string): { bvid?: string; aid?: string; page?: string } | null {
  try {
    const url = new URL(inputUrl)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'player.bilibili.com') {
      const bvid = url.searchParams.get('bvid') || undefined
      const aid = url.searchParams.get('aid') || undefined
      const page = url.searchParams.get('page') || undefined
      return bvid || aid ? { bvid, aid, page } : null
    }

    if (host.endsWith('bilibili.com')) {
      const parts = url.pathname.split('/').filter(Boolean)
      const videoIndex = parts.indexOf('video')
      const id = videoIndex >= 0 ? parts[videoIndex + 1] : undefined
      const page = url.searchParams.get('p') || undefined
      if (!id) return null
      if (/^BV/i.test(id)) return { bvid: id, page }
      if (/^av\d+$/i.test(id)) return { aid: id.replace(/^av/i, ''), page }
    }
  } catch {
    return null
  }

  return null
}

function getYouTubeVideoId(inputUrl: string): string | null {
  try {
    const url = new URL(inputUrl)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null
    if (!host.endsWith('youtube.com') && !host.endsWith('youtube-nocookie.com')) return null

    const queryId = url.searchParams.get('v')
    if (queryId) return queryId

    const parts = url.pathname.split('/').filter(Boolean)
    return parts.length >= 2 && ['embed', 'shorts', 'live'].includes(parts[0])
      ? parts[1] || null
      : null
  } catch {
    return null
  }
}

export function supportsVideoEmbed(videoUrl: string): boolean {
  const bilibili = getBilibiliVideoId(videoUrl)
  return Boolean(bilibili?.bvid || bilibili?.aid || getYouTubeVideoId(videoUrl))
}

export function VideoEmbed({ videoUrl, title }: { videoUrl: string; title?: string }) {
  const bilibili = getBilibiliVideoId(videoUrl)

  if (bilibili?.bvid || bilibili?.aid) {
    const params = new URLSearchParams({ high_quality: '1', danmaku: '0' })
    if (bilibili.bvid) params.set('bvid', bilibili.bvid)
    if (bilibili.aid) params.set('aid', bilibili.aid)
    if (bilibili.page) params.set('page', bilibili.page)

    return (
      <iframe
        className="h-full w-full"
        src={`https://player.bilibili.com/player.html?${params.toString()}`}
        title={title || 'Embedded video player'}
        loading="lazy"
        allow="fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    )
  }

  const youtubeId = getYouTubeVideoId(videoUrl)
  if (!youtubeId) return null

  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' })
  return (
    <iframe
      className="h-full w-full"
      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?${params.toString()}`}
      title={title || 'Embedded video player'}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  )
}
