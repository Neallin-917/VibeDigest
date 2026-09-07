import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => setLocale.mockReset())

  it('names the control and options in the active locale', async () => {
    const user = userEvent.setup()
    render(<LanguageDropdown />)

    const trigger = screen.getByRole('combobox', { name: '语言' })
    expect(trigger).toHaveTextContent('中文')
    await user.click(trigger)

    expect(screen.getByRole('listbox', { name: '语言' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '英文' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '中文' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: '日文' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'English' })).not.toBeInTheDocument()
  })

  it('switches language from the whole option', async () => {
    const user = userEvent.setup()
    render(<LanguageDropdown />)

    await user.click(screen.getByRole('combobox', { name: '语言' }))
    await user.click(screen.getByRole('option', { name: '英文' }))

    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('opens at the selected language and supports arrow navigation and selection', async () => {
    const user = userEvent.setup()
    render(<LanguageDropdown />)

    await user.tab()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('option', { name: '中文' })).toHaveFocus())

    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(screen.getByRole('option', { name: '英文' })).toHaveFocus())
    await user.keyboard('{Enter}')

    expect(setLocale).toHaveBeenCalledWith('en')
    await waitFor(() => expect(screen.getByRole('combobox', { name: '语言' })).toHaveFocus())
  })

  it('closes on Escape and restores focus without changing language', async () => {
    const user = userEvent.setup()
    render(<LanguageDropdown />)

    const trigger = screen.getByRole('combobox', { name: '语言' })
    await user.tab()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: '中文' })).toHaveFocus())
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(setLocale).not.toHaveBeenCalled()
  })
})
