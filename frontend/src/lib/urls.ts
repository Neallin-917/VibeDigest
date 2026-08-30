const SUPPORTED_SOURCES = [
    { domain: 'youtube.com', source: 'youtube', name: 'YouTube' },
    { domain: 'youtu.be', source: 'youtube', name: 'YouTube' },
    { domain: 'podcasts.apple.com', source: 'apple_podcasts', name: 'Apple Podcasts' },
    { domain: 'bilibili.com', source: 'bilibili', name: 'Bilibili' },
    { domain: 'xiaoyuzhoufm.com', source: 'xiaoyuzhou', name: 'Xiaoyuzhou' },
] as const

export const SUPPORTED_DOMAINS = SUPPORTED_SOURCES.map(source => source.domain)
export type SupportedSource = (typeof SUPPORTED_SOURCES)[number]['source']

function hasContentIdentifier(url: URL, source: SupportedSource): boolean {
    const pathSegments = url.pathname.split('/').filter(Boolean)

    switch (source) {
        case 'youtube': {
            const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
            if (hostname === 'youtu.be') return Boolean(pathSegments[0])
            if (url.pathname.replace(/\/$/, '') === '/watch') {
                return Boolean(url.searchParams.get('v')?.trim())
            }
            return ['shorts', 'live', 'embed'].includes(pathSegments[0] ?? '')
                && Boolean(pathSegments[1])
        }
        case 'apple_podcasts':
            return pathSegments.some(segment => /^id\d+$/i.test(segment))
        case 'bilibili':
            return /^\/video\/(?:BV[0-9A-Za-z]+|av\d+)(?:\/|$)/i.test(url.pathname)
        case 'xiaoyuzhou':
            return pathSegments[0] === 'episode' && Boolean(pathSegments[1])
    }
}

export type SupportedUrlDetails = {
    /** The complete visitor input, trimmed only at its outer boundary. */
    originalUrl: string
    /** A safe absolute URL for rendering the retained source as a link. */
    href: string
    source: SupportedSource
    sourceName: string
}

export function getSupportedUrlDetails(input: string): SupportedUrlDetails | null {
    const originalUrl = input?.trim()
    if (!originalUrl || !originalUrl.includes('.')) return null

    try {
        const urlToParse = /^https?:\/\//i.test(originalUrl) ? originalUrl : `https://${originalUrl}`
        const parsed = new URL(urlToParse)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

        const hostname = parsed.hostname.toLowerCase()
        const source = SUPPORTED_SOURCES.find(candidate =>
            hostname === candidate.domain || hostname.endsWith(`.${candidate.domain}`)
        )
        if (!source || !hasContentIdentifier(parsed, source.source)) return null

        return {
            originalUrl,
            href: parsed.toString(),
            source: source.source,
            sourceName: source.name,
        }
    } catch {
        return null
    }
}

/**
 * Validates if a URL or text input corresponds to a supported platform.
 * Supports raw domain input (e.g. "youtube.com/watch?v=...") and full URLs.
 */
export function isSupportedUrl(url: string): boolean {
    return getSupportedUrlDetails(url) !== null
}
