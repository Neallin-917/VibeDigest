import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskItem } from './TaskItem'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string) => ({
      'common.untitled': '未命名',
      'common.delete': '删除',
    })[key] ?? key,
  }),
}))

describe('TaskItem', () => {
  it('localizes missing titles and delete controls', () => {
    render(
      <TaskItem
        task={{
          id: 'task-1',
          video_url: 'https://example.com/audio',
          status: 'completed',
          created_at: '2026-09-04T00:00:00Z',
        }}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        isDeleting={false}
      />
    )

    expect(screen.getByText('未命名')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
    expect(screen.queryByText('Untitled')).not.toBeInTheDocument()
  })
})
