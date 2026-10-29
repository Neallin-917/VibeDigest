import { describe, it, expect } from 'vitest'
import { getSupportedUrlDetails, isSupportedUrl } from './urls'

describe('isSupportedUrl', () => {
    it('should return true for valid YouTube URLs', () => {
        expect(isSupportedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
        expect(isSupportedUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
        expect(isSupportedUrl('youtu.be/dQw4w9WgXcQ')).toBe(true)
        expect(isSupportedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true)
        expect(isSupportedUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(true)
    })

    it.each([
        'https://www.bilibili.com/video/BV1GJ411x7h7',
        'bilibili.com/video/BV1GJ411x7h7',
        'https://podcasts.apple.com/us/podcast/id123456?i=123',
        'https://www.xiaoyuzhoufm.com/episode/123',
    ])('rejects sources without supported caption extraction: %s', (url) => {
        expect(isSupportedUrl(url)).toBe(false)
        expect(getSupportedUrlDetails(url)).toBeNull()
    })

    it('should return false for unsupported domains', () => {
        expect(isSupportedUrl('https://google.com')).toBe(false)
        expect(isSupportedUrl('facebook.com')).toBe(false)
    })

    it.each([
        'https://youtube.com',
        'https://youtu.be',
        'https://youtube.com/@channel',
        'https://youtube.com/playlist?list=PL123',
        'https://podcasts.apple.com',
        'https://bilibili.com',
        'https://xiaoyuzhoufm.com/podcast/123',
    ])('rejects a supported site without a content identifier: %s', (url) => {
        expect(isSupportedUrl(url)).toBe(false)
        expect(getSupportedUrlDetails(url)).toBeNull()
    })

    it('should return false for non-URL text', () => {
        expect(isSupportedUrl('hello world')).toBe(false)
        expect(isSupportedUrl('   ')).toBe(false)
        expect(isSupportedUrl('')).toBe(false)
    })

    it('retains the complete original URL while identifying its source', () => {
        const originalUrl = 'https://www.youtube.com/watch?v=test123&list=playlist#t=42'

        expect(getSupportedUrlDetails(originalUrl)).toEqual({
            originalUrl,
            href: originalUrl,
            source: 'youtube',
            sourceName: 'YouTube',
        })
    })

    it('adds a safe protocol only to the rendered link', () => {
        expect(getSupportedUrlDetails('youtu.be/test123')).toEqual({
            originalUrl: 'youtu.be/test123',
            href: 'https://youtu.be/test123',
            source: 'youtube',
            sourceName: 'YouTube',
        })
    })
})
