import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock updateSession before importing proxy
const mockUpdateSession = vi.fn()
vi.mock('@/lib/supabase/proxy', () => ({
    updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}))

// Mock env
vi.mock('@/env', () => ({
    env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
}))

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
    createServerClient: vi.fn(() => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
    })),
}))

// Mock negotiator and intl-localematcher
vi.mock('negotiator', () => ({
    default: class MockNegotiator {
        languages() { return ['en'] }
    },
}))
vi.mock('@formatjs/intl-localematcher', () => ({
    match: vi.fn(() => 'en'),
}))

import { proxy } from './proxy'

function makeRequest(path: string, options?: { headers?: Record<string, string> }): NextRequest {
    const url = new URL(path, 'http://localhost:3000')
    return new NextRequest(url, {
        headers: options?.headers,
    })
}

describe('proxy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUpdateSession.mockResolvedValue({
            response: NextResponse.next(),
            user: null,
            supabase: {}
        })
    })

    describe('static assets — skip entirely', () => {
        it('should pass through /_next requests without calling updateSession', async () => {
            const response = await proxy(makeRequest('/_next/static/chunk.js'))
            expect(mockUpdateSession).not.toHaveBeenCalled()
            expect(response.status).toBe(200)
        })

        it('should pass through /static requests', async () => {
            const response = await proxy(makeRequest('/static/image.png'))
            expect(mockUpdateSession).not.toHaveBeenCalled()
            expect(response.status).toBe(200)
        })

        it('should pass through favicon.ico', async () => {
            const response = await proxy(makeRequest('/favicon.ico'))
            expect(mockUpdateSession).not.toHaveBeenCalled()
            expect(response.status).toBe(200)
        })

        it('should pass through requests with file extensions', async () => {
            const response = await proxy(makeRequest('/robots.txt'))
            expect(mockUpdateSession).not.toHaveBeenCalled()
            expect(response.status).toBe(200)
        })
    })

    describe('API routes — refresh session via updateSession', () => {
        it('should call updateSession for /api/chat', async () => {
            await proxy(makeRequest('/api/chat'))
            expect(mockUpdateSession).toHaveBeenCalledTimes(1)
            expect(mockUpdateSession).toHaveBeenCalledWith(expect.any(NextRequest))
        })

        it('should call updateSession for /api/threads/123', async () => {
            await proxy(makeRequest('/api/threads/123'))
            expect(mockUpdateSession).toHaveBeenCalledTimes(1)
        })

        it('should return the response from updateSession', async () => {
            const customResponse = new NextResponse('refreshed', { status: 200 })
            mockUpdateSession.mockResolvedValue({
                response: customResponse,
                user: null,
                supabase: {}
            })

            const response = await proxy(makeRequest('/api/chat'))
            expect(response).toBe(customResponse)
        })
    })

    describe('i18n routing — non-locale paths redirect', () => {
        it('should redirect non-locale paths to detected locale', async () => {
            const response = await proxy(makeRequest('/history'))
            expect(response.status).toBe(307)
            expect(response.headers.get('location')).toContain('/en/history')
            expect(mockUpdateSession).toHaveBeenCalled()
        })
    })

    describe('protected routes', () => {
        it('should redirect to login if no user and no bypass cookie', async () => {
            mockUpdateSession.mockResolvedValue({
                response: NextResponse.next(),
                user: null,
                supabase: {}
            })
            const response = await proxy(makeRequest('/en/history'))
            expect(response.status).toBe(307)
            expect(response.headers.get('location')).toContain('/en/login')
        })

        it('should allow access if user is present', async () => {
            mockUpdateSession.mockResolvedValue({
                response: NextResponse.next(),
                user: { id: '123' },
                supabase: {}
            })
            const response = await proxy(makeRequest('/en/history'))
            expect(response.status).toBe(200)
        })

        it('should allow access if bypass cookie is present', async () => {
            mockUpdateSession.mockResolvedValue({
                response: NextResponse.next(),
                user: null,
                supabase: {}
            })
            const request = makeRequest('/en/history', {
                headers: { 'cookie': 'VIBEDIGEST_E2E_AUTH_BYPASS=true' }
            })
            const response = await proxy(request)
            expect(response.status).toBe(200)
        })
    })
})
