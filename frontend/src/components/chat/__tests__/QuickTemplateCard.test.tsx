import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuickTemplateCard } from '../QuickTemplateCard'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'tasks.videoThumbnailAlt': 'Video thumbnail',
      'common.untitled': 'Untitled',
    })[key] ?? key,
  }),
}))

const task = {
  id: 'example-1',
  video_url: 'https://www.youtube.com/watch?v=example',
  video_title: 'Example video',
  thumbnail_url: 'https://i.ytimg.com/vi/example/maxresdefault.jpg',
}

describe('QuickTemplateCard', () => {
  it('loads a visible thumbnail eagerly and promotes the leading card', () => {
    render(
      <QuickTemplateCard
        task={task}
        onSelect={vi.fn()}
        highPriorityThumbnail
      />
    )

    const image = screen.getByRole('img', { name: task.video_title })

    expect(image).toHaveAttribute('loading', 'eager')
    expect(image).toHaveAttribute('fetchpriority', 'high')
  })

  it('defers non-leading thumbnails at automatic priority', () => {
    render(<QuickTemplateCard task={task} onSelect={vi.fn()} />)

    const image = screen.getByRole('img', { name: task.video_title })

    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('fetchpriority', 'auto')
  })
})
