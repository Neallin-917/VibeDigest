import { render, screen } from '@testing-library/react'
import { VideoEmbed, supportsVideoEmbed } from './VideoEmbed'
import { describe, it, expect } from 'vitest'

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
            const iframe = screen.getByTitle('Embedded video player')
            expect(iframe).toHaveAttribute('src', expect.stringContaining('/embed/TEST_ID'))
            expect(iframe).toHaveAttribute('src', expect.not.stringContaining('start='))
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
