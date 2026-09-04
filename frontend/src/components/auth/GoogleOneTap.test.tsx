import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GoogleOneTap } from './GoogleOneTap'

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  initialize: vi.fn(),
  prompt: vi.fn(),
  setQueryData: vi.fn(),
  signInWithIdToken: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  locale: 'zh' as 'en' | 'zh' | 'ja',
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
}))

vi.mock('@/hooks/useAccountQueries', () => ({
  accountKeys: { currentUser: ['account', 'current-user'] },
  useCurrentUserQuery: () => ({ data: null, isPending: false }),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { signInWithIdToken: mocks.signInWithIdToken },
  }),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: mocks.locale,
    t: (key: string) => {
      if (key === 'auth.errors.generic') {
        return {
          en: 'An error occurred',
          zh: '发生错误',
          ja: 'エラーが発生しました',
        }[mocks.locale]
      }
      if (key === 'auth.signInSuccess') return 'Signed in'
      return key
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'google-client-id' },
}))

async function triggerCredentialCallback() {
  const script = await waitFor(() => {
    const element = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    )
    expect(element).not.toBeNull()
    return element as HTMLScriptElement
  })

  act(() => script.onload?.(new Event('load')))
  expect(mocks.initialize).toHaveBeenCalledOnce()
  const config = mocks.initialize.mock.calls[0][0] as {
    callback: (response: { credential: string }) => Promise<void>
  }
  await act(() => config.callback({ credential: 'google-credential' }))
}

describe('GoogleOneTap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.locale = 'zh'
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('crypto', {
      randomUUID: () => 'nonce',
      subtle: {
        digest: async () => new Uint8Array([1, 2, 3]).buffer,
      },
    })
    window.google = {
      accounts: {
        id: {
          initialize: mocks.initialize,
          prompt: mocks.prompt,
          cancel: mocks.cancel,
          disableAutoSelect: vi.fn(),
          revoke: vi.fn(),
        },
      },
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete window.google
  })

  it('uses the localized fallback for a returned upstream error', async () => {
    mocks.signInWithIdToken.mockResolvedValue({
      data: { session: null },
      error: { message: 'PRIVATE_TOKEN=do-not-display' },
    })

    render(<GoogleOneTap />)
    await triggerCredentialCallback()

    expect(mocks.toastError).toHaveBeenCalledWith('发生错误')
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('PRIVATE_TOKEN'))
    expect(console.error).toHaveBeenCalledWith('Google One Tap sign-in failed')
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('PRIVATE_TOKEN')
  })

  it('uses the English fallback when the upstream call throws', async () => {
    mocks.locale = 'en'
    mocks.signInWithIdToken.mockRejectedValue(
      new Error('Error: provider failure\n at privateFunction (/srv/app/provider.ts:42:7)')
    )

    render(<GoogleOneTap />)
    await triggerCredentialCallback()

    expect(mocks.toastError).toHaveBeenCalledWith('An error occurred')
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('/srv/app'))
    expect(console.error).toHaveBeenCalledWith('Google One Tap sign-in failed')
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('/srv/app')
  })
})
