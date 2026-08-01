const UNUSABLE_TITLES = new Set(['unknown', 'untitled', 'loading...'])

export function isUsableTaskTitle(value: string | null | undefined): value is string {
  const title = value?.trim()
  return Boolean(title && !UNUSABLE_TITLES.has(title.toLowerCase()))
}

export function getTaskDisplayTitle(
  videoTitle: string | null | undefined,
  videoUrl: string | null | undefined,
  fallback: string
) {
  const title = videoTitle?.trim()
  if (isUsableTaskTitle(title)) {
    return title
  }

  if (!videoUrl) return fallback

  try {
    const hostname = new URL(videoUrl).hostname.replace(/^www\./, '').toLowerCase()
    const source = hostname === 'youtu.be' || hostname.endsWith('youtube.com')
      ? 'YouTube'
      : hostname.endsWith('bilibili.com') || hostname === 'b23.tv'
        ? 'Bilibili'
        : hostname.endsWith('vimeo.com')
          ? 'Vimeo'
          : hostname

    return `${source} · ${fallback}`
  } catch {
    return fallback
  }
}
