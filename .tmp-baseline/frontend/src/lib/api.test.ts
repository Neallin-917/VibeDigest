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

    describe('request', () => {
        it('handles successful requests', async () => {
            const mockResponse = { success: true }
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const formData = new FormData()
            await ApiClient.processVideo(formData, mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/process-video'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`
                    })
                })
            )
        })

        it('handles error responses with detail', async () => {
            const errorMessage = 'Validation failed'
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                statusText: 'Bad Request',
                json: async () => ({ detail: errorMessage }),
            } as Response)

            const formData = new FormData()
            await expect(ApiClient.processVideo(formData, mockToken))
                .rejects.toThrow(errorMessage)
        })

        it('handles error responses without detail', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error',
                json: async () => ({}),
            } as Response)

            const formData = new FormData()
            await expect(ApiClient.processVideo(formData, mockToken))
                .rejects.toThrow('API Error: Internal Server Error')
        })
        
        it('handles JSON parsing error in error response', async () => {
             fetchSpy.mockResolvedValueOnce({
                ok: false,
                statusText: 'Gateway Timeout',
                json: async () => { throw new Error('Invalid JSON') },
            } as unknown as Response)

            const formData = new FormData()
            await expect(ApiClient.processVideo(formData, mockToken))
                .rejects.toThrow('API Error: Gateway Timeout')
        })
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
        it('sends correct request', async () => {
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
                    body: JSON.stringify(feedbackData)
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

            await ApiClient.createCheckoutSession('price-123', mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/create-checkout-session'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
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

            await ApiClient.createCryptoCharge('price-123', mockToken)

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/create-crypto-charge'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            )
        })
    })
})
