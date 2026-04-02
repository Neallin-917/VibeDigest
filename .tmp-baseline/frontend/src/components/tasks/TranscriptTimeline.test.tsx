import { render, screen, fireEvent } from '@testing-library/react'
import { TranscriptTimeline } from './TranscriptTimeline'
import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('TranscriptTimeline', () => {
    const mockOnSeek = vi.fn()
    const mockPayload = JSON.stringify({
        segments: [
            { start: 0, end: 10, text: "Introductions." },
            // Force split with gap > 2.5s
            { start: 15, end: 25, text: "Main content." },
            // Force split again
            { start: 30, end: 40, text: "Conclusion." }
        ]
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders blocks correctly', () => {
        render(<TranscriptTimeline
            scriptRawContent={mockPayload}
            canSeek={true}
            onSeek={mockOnSeek}
        />)

        expect(screen.getByText('Introductions.')).toBeInTheDocument()
        expect(screen.getByText('Main content.')).toBeInTheDocument()
        expect(screen.getByText('Conclusion.')).toBeInTheDocument()
        expect(screen.getByText('00:00')).toBeInTheDocument()
    })

    it('calls onSeek when a block is clicked', () => {
        render(<TranscriptTimeline
            scriptRawContent={mockPayload}
            canSeek={true}
            onSeek={mockOnSeek}
        />)

        fireEvent.click(screen.getByText('Main content.'))
        expect(mockOnSeek).toHaveBeenCalledWith(15)
    })

    it('disables interaction when canSeek is false', () => {
        render(<TranscriptTimeline
            scriptRawContent={mockPayload}
            canSeek={false}
            onSeek={mockOnSeek}
        />)

        // Find the button wrapping the text
        const button = screen.getByText('Main content.').closest('button')
        expect(button).toBeDisabled()

        fireEvent.click(button!)
        expect(mockOnSeek).not.toHaveBeenCalled()
    })

    it('renders fallback when content is missing', () => {
        render(<TranscriptTimeline
            scriptRawContent=""
            canSeek={true}
            onSeek={mockOnSeek}
            emptyFallback={<div>No script available</div>}
        />)

        expect(screen.getByText('No script available')).toBeInTheDocument()
    })
})
