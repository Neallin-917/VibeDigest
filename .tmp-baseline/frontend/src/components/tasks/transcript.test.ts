import { formatSeconds, parseScriptRawPayload } from './transcript'
import { describe, it, expect } from 'vitest'

describe('transcript utils', () => {
    describe('formatSeconds', () => {
        it('formats zero correctly', () => {
            expect(formatSeconds(0)).toBe('00:00')
        })

        it('formats minutes and seconds', () => {
            expect(formatSeconds(65)).toBe('01:05')
            expect(formatSeconds(600)).toBe('10:00')
        })

        it('formats hours correctly', () => {
            expect(formatSeconds(3665)).toBe('01:01:05')
        })

        it('handles non-finite numbers', () => {
            expect(formatSeconds(Infinity)).toBe('00:00')
            expect(formatSeconds(NaN)).toBe('00:00')
        })
    })

    describe('parseScriptRawPayload', () => {
        it('returns null for empty input', () => {
            expect(parseScriptRawPayload('')).toBeNull()
            expect(parseScriptRawPayload(undefined)).toBeNull()
        })

        it('returns null for invalid json', () => {
            expect(parseScriptRawPayload('{invalid')).toBeNull()
        })

        it('returns payload for valid json', () => {
            const input = JSON.stringify({
                version: 1,
                segments: [{ start: 0, end: 1, text: "Hello" }]
            })
            const result = parseScriptRawPayload(input)
            expect(result).toEqual({
                version: 1,
                segments: [{ start: 0, end: 1, text: "Hello" }]
            })
        })
    })
})
