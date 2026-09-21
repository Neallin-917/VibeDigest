import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AudioEmbed } from './AudioEmbed'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string) => ({
      'tasks.audioCoverAlt': '音频封面',
      'tasks.audioEpisodeFallback': '单集',
      'tasks.audioUnsupported': '你的浏览器不支持音频播放。',
    })[key] ?? key,
  }),
}))

describe('AudioEmbed', () => {
  it('localizes its title and browser fallback', () => {
    render(<AudioEmbed audioUrl="https://example.com/episode.mp3" />)

    expect(screen.getByRole('heading', { name: '单集' })).toBeInTheDocument()
    expect(screen.getByLabelText('单集')).toBeInTheDocument()
    expect(screen.getByText('你的浏览器不支持音频播放。')).toBeInTheDocument()
    expect(screen.queryByText('Episode')).not.toBeInTheDocument()
  })
})
