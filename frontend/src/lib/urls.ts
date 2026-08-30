const SUPPORTED_SOURCES = [
    { domain: 'youtube.com', source: 'youtube', name: 'YouTube' },
    { domain: 'youtu.be', source: 'youtube', name: 'YouTube' },
    { domain: 'podcasts.apple.com', source: 'apple_podcasts', name: 'Apple Podcasts' },
    { domain: 'bilibili.com', source: 'bilibili', name: 'Bilibili' },
    { domain: 'xiaoyuzhoufm.com', source: 'xiaoyuzhou', name: 'Xiaoyuzhou' },
] as const

export const SUPPORTED_DOMAINS = SUPPORTED_SOURCES.map(source => source.domain)
export type SupportedSource = (typeof SUPPORTED_SOURCES)[number]['source']

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
        if (!source) return null

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
