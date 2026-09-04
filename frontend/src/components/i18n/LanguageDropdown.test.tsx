import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LanguageDropdown } from './LanguageDropdown'

const setLocale = vi.fn()

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh',
    setLocale,
    t: (key: string) => key === 'common.language' ? '语言' : key,
  }),
}))

describe('LanguageDropdown', () => {
  it('uses the active locale for its label and language names', () => {
    render(<LanguageDropdown />)

    fireEvent.click(screen.getByRole('button', { name: '语言' }))

    expect(screen.getByRole('listbox', { name: '语言' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '英文' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '中文' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '日文' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'English' })).not.toBeInTheDocument()
  })

  it('keeps language switching behavior intact', () => {
    render(<LanguageDropdown />)

    fireEvent.click(screen.getByRole('button', { name: '语言' }))
    fireEvent.click(screen.getByRole('option', { name: '英文' }))

    expect(setLocale).toHaveBeenCalledWith('en')
  })
})
