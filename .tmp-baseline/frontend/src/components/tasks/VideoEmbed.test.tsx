import { render, screen } from '@testing-library/react'
import { VideoEmbed, supportsVideoEmbed } from './VideoEmbed'
import { vi, describe, it, expect } from 'vitest'

// Mock YouTubePlayer since it uses standard React rendering
vi.mock('@/components/tasks/YouTubePlayer', () => ({
    YouTubePlayer: ({ videoId }: { videoId: string }) => <div data-testid="youtube-player">{videoId}</div>
}))

describe('VideoEmbed', () => {
    describe('supportsVideoEmbed', () => {
        it('supports youtube urls', () => {
            expect(supportsVideoEmbed('https://www.youtube.com/watch?v=123')).toBe(true)
            expect(supportsVideoEmbed('https://youtu.be/123')).toBe(true)
        })

        it('supports bilibili urls', () => {
            expect(supportsVideoEmbed('https://www.bilibili.com/video/BV123')).toBe(true)
            expect(supportsVideoEmbed('https://player.bilibili.com/player.html?bvid=BV123')).toBe(true)
        })

        it('rejects unsupported urls', () => {
            expect(supportsVideoEmbed('https://example.com')).toBe(false)
            expect(supportsVideoEmbed('')).toBe(false)
        })
    })

    describe('rendering', () => {
        it('renders YouTube player for youtube links', () => {
            render(<VideoEmbed videoUrl="https://www.youtube.com/watch?v=TEST_ID" />)
            expect(screen.getByTestId('youtube-player')).toHaveTextContent('TEST_ID')
        })

        it('renders Bilibili iframe for bilibili links', () => {
            // Bilibili component is internal to VideoEmbed, so we look for iframe
            render(<VideoEmbed videoUrl="https://www.bilibili.com/video/BVtest" />)
            const iframe = screen.getByTitle('Embedded video player')
            expect(iframe).toBeInTheDocument()
            expect(iframe).toHaveAttribute('src', expect.stringContaining('bvid=BVtest'))
        })

        it('renders null for unknown links', () => {
            const { container } = render(<VideoEmbed videoUrl="https://example.com" />)
            expect(container).toBeEmptyDOMElement()
        })
    })
})
