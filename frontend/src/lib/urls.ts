const SUPPORTED_SOURCES = [
    { domain: 'youtube.com', name: 'YouTube' },
    { domain: 'youtu.be', name: 'YouTube' },
    { domain: 'podcasts.apple.com', name: 'Apple Podcasts' },
    { domain: 'bilibili.com', name: 'Bilibili' },
    { domain: 'xiaoyuzhoufm.com', name: 'Xiaoyuzhou' },
] as const

export const SUPPORTED_DOMAINS = SUPPORTED_SOURCES.map(source => source.domain)

export type SupportedUrlDetails = {
    /** The complete visitor input, trimmed only at its outer boundary. */
    originalUrl: string
    /** A safe absolute URL for rendering the retained source as a link. */
    href: string
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
