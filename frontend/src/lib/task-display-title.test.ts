import { describe, expect, it } from 'vitest'

import { getTaskDisplayTitle, isUsableTaskTitle } from './task-display-title'

describe('getTaskDisplayTitle', () => {
  it('keeps a real title', () => {
    expect(getTaskDisplayTitle('  A real video title  ', 'https://youtube.com/watch?v=abc', 'Video task'))
      .toBe('A real video title')
  })

  it('uses a clear source label instead of an opaque hostname when metadata is missing', () => {
    expect(getTaskDisplayTitle(undefined, 'https://www.youtube.com/watch?v=abc', 'Video task'))
      .toBe('YouTube · Video task')
  })

  it('does not show an incomplete loading label as if it were a title', () => {
    expect(getTaskDisplayTitle('Loading...', 'https://vimeo.com/123', 'Video task'))
      .toBe('Vimeo · Video task')
  })

  it('allows a resolved player title to replace an unusable saved value', () => {
    expect(isUsableTaskTitle('Unknown')).toBe(false)
    expect(getTaskDisplayTitle('Resolved player title', 'https://youtube.com/watch?v=abc', 'Video task'))
      .toBe('Resolved player title')
  })

  it('keeps a useful fallback when the URL is not parseable', () => {
    expect(getTaskDisplayTitle(undefined, 'not-a-url', 'Video task')).toBe('Video task')
  })
})
