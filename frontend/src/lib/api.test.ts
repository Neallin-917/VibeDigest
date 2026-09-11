import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient, API_BASE_URL } from './api'

describe('ApiClient', () => {
    const mockToken = 'test-token'
    let fetchSpy: any

    beforeEach(() => {
        fetchSpy = vi.spyOn(global, 'fetch')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('uses correct API base URL', () => {
        expect(API_BASE_URL).toBeDefined()
    })

    it.each([
        { detail: 'PRIVATE_TOKEN=do-not-display' },
        { error: '<html><script>window.secret = true</script></html>' },
        { detail: 'Error: provider failed\n at privateFunction (/srv/app/provider.ts:42:7)' },
    ])('does not expose upstream error details', async (payload) => {
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            statusText: 'Bad Gateway',
            json: async () => payload,
        } as Response)

        const error = await ApiClient.retryOutput('out-123', mockToken).catch(value => value)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).not.toMatch(/PRIVATE_TOKEN|window\.secret|\/srv\/app/)
    })

    describe('retryOutput', () => {
        it('sends correct request', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } as Response)

            await ApiClient.retryOutput('out-123', mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/retry-output'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            )
        })
    })

    describe('updateTaskTitle', () => {
        it('sends correct request', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } as Response)

            await ApiClient.updateTaskTitle('task-123', 'New Title', mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/tasks/task-123'),
                expect.objectContaining({
                    method: 'PATCH',
                    body: JSON.stringify({ video_title: 'New Title' }),
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                })
            )
        })
    })

    describe('submitFeedback', () => {
        it('sends an authenticated request when a token is available', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } as Response)

            const feedbackData = { category: 'bug', message: 'It broke', contact_email: 'test@example.com' }
            await ApiClient.submitFeedback(feedbackData, mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/feedback'),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(feedbackData),
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`
                    })
                })
            )
        })

        it('omits the authorization header for anonymous feedback', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } as Response)

            await ApiClient.submitFeedback({ category: 'support', message: 'Need help' })

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/feedback'),
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
            )
        })
    })

    describe('createCheckoutSession', () => {
        it('sends correct request', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } as Response)

            await ApiClient.createCheckoutSession('price-123', mockToken, 'zh')

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/create-checkout-session'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            )
            const options = fetchSpy.mock.calls[0]?.[1] as RequestInit
            expect((options.body as FormData).get('plan_key')).toBe('price-123')
            expect((options.body as FormData).get('locale')).toBe('zh')
        })
    })

    describe('createCustomerPortal', () => {
        it('sends an authenticated POST request', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ url: 'https://creem.io/portal' }),
            } as Response)

            await ApiClient.createCustomerPortal(mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/customer-portal'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`
                    })
                })
            )
        })
    })

    describe('createCryptoCharge', () => {
        it('sends correct request', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } as Response)

            await ApiClient.createCryptoCharge('price-123', mockToken, 'zh')

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/create-crypto-charge'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            )
            const options = fetchSpy.mock.calls[0]?.[1] as RequestInit
            expect((options.body as FormData).get('plan_key')).toBe('price-123')
            expect((options.body as FormData).get('locale')).toBe('zh')
        })
    })
})
