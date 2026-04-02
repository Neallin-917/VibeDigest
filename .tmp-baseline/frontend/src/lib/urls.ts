export const SUPPORTED_DOMAINS = [
    'youtube.com',
    'youtu.be',
    'podcasts.apple.com',
    'bilibili.com',
    'xiaoyuzhoufm.com'
]

/**
 * Validates if a URL or text input corresponds to a supported platform.
 * Supports raw domain input (e.g. "youtube.com/watch?v=...") and full URLs.
 */
export function isSupportedUrl(url: string): boolean {
    if (!url || !url.trim()) return false
    
    // Simple check: if it doesn't contain a dot, it's definitely not a URL
    if (!url.includes('.')) return false

    try {
        // Handle inputs without protocol
        const urlToParse = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`
        const hostname = new URL(urlToParse).hostname.toLowerCase()
        
        return SUPPORTED_DOMAINS.some(domain => 
            hostname === domain || hostname.endsWith(`.${domain}`)
        )
    } catch (e) {
        return false
    }
}
