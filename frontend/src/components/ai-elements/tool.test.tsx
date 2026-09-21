import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ToolInput, ToolOutput } from './tool'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'chat.tools.parameters': '参数',
      'chat.tools.result': '结果',
      'chat.tools.error': '错误',
    } as Record<string, string>)[key] ?? key,
  }),
}))

describe('ToolInput', () => {
  it('localizes the parameter heading', () => {
    render(<ToolInput input={{ query: 'test' }} />)

    expect(screen.getByRole('heading', { name: '参数' })).toBeInTheDocument()
    expect(screen.queryByText('Parameters')).not.toBeInTheDocument()
  })

  it('localizes the output heading', () => {
    render(<ToolOutput output="done" errorText={undefined} />)

    expect(screen.getByRole('heading', { name: '结果' })).toBeInTheDocument()
    expect(screen.queryByText('Result')).not.toBeInTheDocument()
  })

  it('localizes the error heading', () => {
    render(<ToolOutput output={undefined} errorText="失败" />)

    expect(screen.getByRole('heading', { name: '错误' })).toBeInTheDocument()
    expect(screen.queryByText('Error')).not.toBeInTheDocument()
  })
})
