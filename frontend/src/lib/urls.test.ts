import { describe, it, expect } from 'vitest'
import { getSupportedUrlDetails, isSupportedUrl } from './urls'

describe('isSupportedUrl', () => {
    it('should return true for valid YouTube URLs', () => {
        expect(isSupportedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
        expect(isSupportedUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
        expect(isSupportedUrl('youtu.be/dQw4w9WgXcQ')).toBe(true)
    })

    it('should return true for valid Bilibili URLs', () => {
        expect(isSupportedUrl('https://www.bilibili.com/video/BV1GJ411x7h7')).toBe(true)
        expect(isSupportedUrl('bilibili.com/video/BV1GJ411x7h7')).toBe(true)
    })

    it('should return true for Apple Podcasts URLs', () => {
        expect(isSupportedUrl('https://podcasts.apple.com/us/podcast/id123456')).toBe(true)
    })

    it('should return true for Xiaoyuzhou URLs', () => {
        expect(isSupportedUrl('https://www.xiaoyuzhoufm.com/episode/123')).toBe(true)
    })

    it('should return false for unsupported domains', () => {
        expect(isSupportedUrl('https://google.com')).toBe(false)
        expect(isSupportedUrl('facebook.com')).toBe(false)
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
        expect(getSupportedUrlDetails('bilibili.com/video/BV1test')).toEqual({
            originalUrl: 'bilibili.com/video/BV1test',
            href: 'https://bilibili.com/video/BV1test',
            source: 'bilibili',
            sourceName: 'Bilibili',
        })
    })
})
