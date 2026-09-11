import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskSourceCover } from './TaskSourceCover'

const title = 'A source episode'
const thumbnailUrl = 'https://images.example.com/episode.jpg'
const videoUrl = 'https://www.youtube.com/watch?v=episode'

describe('TaskSourceCover', () => {
  it('links the source image to the original episode', () => {
    render(<TaskSourceCover title={title} thumbnailUrl={thumbnailUrl} videoUrl={videoUrl} />)

    expect(screen.getByRole('img', { name: title })).toHaveAttribute('src', thumbnailUrl)
    const link = screen.getByRole('link', { name: title })
    expect(link).toHaveAttribute('href', videoUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps the source link after an image fails and displays a replacement thumbnail', () => {
    const { rerender } = render(
      <TaskSourceCover title={title} thumbnailUrl={thumbnailUrl} videoUrl={videoUrl} />
    )

    fireEvent.error(screen.getByRole('img', { name: title }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('href', videoUrl)

    const replacementUrl = 'https://images.example.com/replacement.jpg'
    rerender(<TaskSourceCover title={title} thumbnailUrl={replacementUrl} videoUrl={videoUrl} />)
    expect(screen.getByRole('img', { name: title })).toHaveAttribute('src', replacementUrl)
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('href', videoUrl)
  })

  it.each([undefined, null, ''])('renders nothing when the thumbnail is %s', (missingThumbnail) => {
    const { container } = render(
      <TaskSourceCover title={title} thumbnailUrl={missingThumbnail} videoUrl={videoUrl} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an unlinked cover when there is no source URL', () => {
    render(<TaskSourceCover title={title} thumbnailUrl={thumbnailUrl} />)
    expect(screen.getByRole('img', { name: title })).toHaveAttribute('src', thumbnailUrl)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
