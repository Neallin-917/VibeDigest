import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeedbackDialog } from '../FeedbackDialog'
import { ApiClient } from '@/lib/api'

const mockGetSession = vi.fn()
const mockSupabase = {
    auth: {
        getSession: mockGetSession
    }
}

vi.mock('@/lib/supabase', () => ({
    createClient: () => mockSupabase
}))

vi.mock('@/lib/api', () => ({
    ApiClient: {
        submitFeedback: vi.fn()
    }
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
    useI18n: () => ({
        t: (key: string) => key
    })
}))

const mockAlert = vi.fn()
Object.defineProperty(window, 'alert', {
    writable: true,
    value: mockAlert
})

describe('FeedbackDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSession.mockResolvedValue({ 
            data: { session: { access_token: 'valid-token' } } 
        })
    })

    it('renders trigger button when uncontrolled', () => {
        render(<FeedbackDialog />)
        expect(screen.getByText('feedback.title')).toBeInTheDocument()
    })

    it('opens dialog on trigger click', async () => {
        render(<FeedbackDialog />)
        
        fireEvent.click(screen.getByText('feedback.title'))
        
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })
        
        expect(screen.getByLabelText('feedback.category')).toBeInTheDocument()
        expect(screen.getByLabelText('feedback.message')).toBeInTheDocument()
    })

    it('submits form with correct data', async () => {
        render(<FeedbackDialog />)
        
        fireEvent.click(screen.getByText('feedback.title'))
        await waitFor(() => screen.getByRole('dialog'))

        fireEvent.change(screen.getByLabelText('feedback.message'), {
            target: { value: 'Test message' }
        })
        fireEvent.change(screen.getByLabelText('feedback.contactEmail'), {
            target: { value: 'test@example.com' }
        })

        fireEvent.click(screen.getByText('feedback.submit'))

        await waitFor(() => {
            expect(ApiClient.submitFeedback).toHaveBeenCalledWith({
                category: 'bug',
                message: 'Test message',
                contact_email: 'test@example.com'
            }, 'valid-token')
        })

        expect(mockAlert).toHaveBeenCalledWith('feedback.success')
    })

    it('handles submission error', async () => {
        (ApiClient.submitFeedback as any).mockRejectedValue(new Error('Network error'))
        
        render(<FeedbackDialog />)
        
        fireEvent.click(screen.getByText('feedback.title'))
        await waitFor(() => screen.getByRole('dialog'))

        fireEvent.change(screen.getByLabelText('feedback.message'), { target: { value: 'Msg' } })
        fireEvent.click(screen.getByText('feedback.submit'))

        await waitFor(() => {
            expect(ApiClient.submitFeedback).toHaveBeenCalled()
        })

        expect(mockAlert).toHaveBeenCalledWith('feedback.error')
    })

    it('handles missing session gracefully', async () => {
        mockGetSession.mockResolvedValue({ data: { session: null } })
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        render(<FeedbackDialog />)
        
        fireEvent.click(screen.getByText('feedback.title'))
        await waitFor(() => screen.getByRole('dialog'))

        fireEvent.change(screen.getByLabelText('feedback.message'), { target: { value: 'Msg' } })
        fireEvent.click(screen.getByText('feedback.submit'))

        await waitFor(() => {
            expect(ApiClient.submitFeedback).toHaveBeenCalledWith({
                category: 'bug',
                message: 'Msg',
                contact_email: undefined
            }, "")
        })
        
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No session found'))
    })
})
