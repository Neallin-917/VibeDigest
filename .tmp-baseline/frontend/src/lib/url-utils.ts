/**
 * Utility functions for URL detection and normalization
 * Follows "Liberal Input, Strict Output" robustness principle
 */

/**
 * Extracts a clean, valid URL from a string or returns null.
 * Handles:
 * 1. Naked domains (e.g. "youtube.com/watch?v=..." -> "https://youtube.com/watch?v=...")
 * 2. Raw YouTube IDs (e.g. "dQw4w9WgXcQ" -> "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
 * 3. Standard http/https URLs
 */
export function extractAndNormalizeUrl(text: string): string | null {
    if (!text || typeof text !== 'string') return null;

    // 1. Pre-cleaning: Remove surrounding whitespace/quotes
    const candidate = text.trim().replace(/^["']|["']$/g, '');

    // 2. Specialized Logic: YouTube Video ID (11 chars)
    // Keep this feature as it's a specific VibeDigest convenience
    // Only matches if the ENTIRE string is the ID (to avoid false positives in sentences)
    const ytIdMatch = candidate.match(/^([a-zA-Z0-9_-]{11})$/);
    if (ytIdMatch) {
        return `https://www.youtube.com/watch?v=${ytIdMatch[1]}`;
    }

    // 3. Extraction Strategy: Find substring that looks like a URL
    // Matches:
    // - Protocol (http/https) OR
    // - www. OR
    // - Domain-like string (word.word) followed by slash or end
    // Supports subdomains like podcasts.apple.com
    const urlRegex = /(?:(?:https?:\/\/)|(?:www\.)|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/)[^\s<>"')\]]+/g;
    
    const matches = candidate.match(urlRegex);
    if (!matches) return null;

    // Process the first candidate found
    let rawUrl = matches[0];

    // 4. Normalization: Ensure Protocol
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        rawUrl = `https://${rawUrl}`;
    }

    // 5. Validation: Use standard URL API
    try {
        const urlObj = new URL(rawUrl);
        
        // Basic sanity check: Hostname must have at least one dot (e.g. "youtube.com")
        // and not be a local file path or invalid string
        if (!urlObj.hostname.includes('.')) {
            return null;
        }

        return urlObj.toString();
    } catch (e) {
        // Invalid URL structure
        return null;
    }
}

// Re-export old functions if needed for backward compat, but mark deprecated
// OR just leave them if they are used elsewhere for specific purposes.
// For this refactor, we are focusing on the replacement for route.ts logic.
