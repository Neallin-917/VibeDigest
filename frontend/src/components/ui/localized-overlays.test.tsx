import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Dialog, DialogContent, DialogTitle } from './dialog'
import { Sheet, SheetContent, SheetTitle } from './sheet'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string) => key === 'common.close' ? '关闭' : key,
  }),
}))

describe('localized overlay controls', () => {
  it('localizes the default dialog close label from the route', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>标题</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('localizes the default sheet close label from the route', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>菜单</SheetTitle>
        </SheetContent>
      </Sheet>
    )

    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('allows a caller to provide a more specific close label', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="关闭登录">
          <DialogTitle>登录</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('button', { name: '关闭登录' })).toBeInTheDocument()
  })
})
