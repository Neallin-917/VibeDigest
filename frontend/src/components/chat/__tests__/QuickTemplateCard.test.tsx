import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuickTemplateCard } from '../QuickTemplateCard'

const task = {
  id: 'example-1',
  video_url: 'https://www.youtube.com/watch?v=example',
  video_title: 'Example video',
  thumbnail_url: 'https://i.ytimg.com/vi/example/maxresdefault.jpg',
}

describe('QuickTemplateCard', () => {
  it('promotes an above-the-fold thumbnail without preloading it', () => {
    render(
      <QuickTemplateCard
        task={task}
        onSelect={vi.fn()}
        eagerThumbnail
        highPriorityThumbnail
      />
    )

    const image = screen.getByRole('img', { name: task.video_title })

    expect(image).toHaveAttribute('loading', 'eager')
    expect(image).toHaveAttribute('fetchpriority', 'high')
  })

  it('keeps later thumbnails lazy and at automatic priority', () => {
    render(<QuickTemplateCard task={task} onSelect={vi.fn()} />)

    const image = screen.getByRole('img', { name: task.video_title })

    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('fetchpriority', 'auto')
  })
})
