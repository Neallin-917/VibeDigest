import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDirectUrlSubmission } from './useDirectUrlSubmission'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('useDirectUrlSubmission', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderSubmissionHook() {
    const setMessages = vi.fn()
    const onChatStarted = vi.fn()
    const activeTaskIdRef = { current: null }

    const hook = renderHook(() =>
      useDirectUrlSubmission({
        sendMessageToApi: vi.fn(),
        setMessages,
        onChatStarted,
        effectiveThreadId: 'thread-1',
        activeTaskIdRef,
      })
    )

    return { ...hook, setMessages, onChatStarted, activeTaskIdRef }
  }

  it('accepts a direct submission only after the task response is usable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        task_id: 'task-1',
        messages: [{ id: 'message-1', role: 'user', parts: [] }],
      }),
    }))
    const { result, setMessages, onChatStarted, activeTaskIdRef } =
      renderSubmissionHook()

    let accepted = false
    await act(async () => {
      accepted = await result.current.handleDirectUrlSubmission(
        'https://youtu.be/example',
        'https://youtu.be/example'
      )
    })

    expect(accepted).toBe(true)
    expect(setMessages).toHaveBeenCalledOnce()
    expect(activeTaskIdRef.current).toBe('task-1')
    expect(onChatStarted).toHaveBeenCalledWith('thread-1', 'task-1')
  })

  it('rejects a failed direct submission so the input can be preserved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Task creation failed',
        details: 'backend is down',
      }),
    }))
    const { result, setMessages } = renderSubmissionHook()

    let accepted = true
    await act(async () => {
      accepted = await result.current.handleDirectUrlSubmission(
        'https://youtu.be/example',
        'https://youtu.be/example'
      )
    })

    expect(accepted).toBe(false)
    expect(result.current.directSubmitError).toBe('backend is down')
    expect(setMessages).not.toHaveBeenCalled()
  })

  it('uses a localized network error and rejects the submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderSubmissionHook()

    let accepted = true
    await act(async () => {
      accepted = await result.current.handleDirectUrlSubmission(
        'https://youtu.be/example',
        'https://youtu.be/example'
      )
    })

    expect(accepted).toBe(false)
    expect(result.current.directSubmitError).toBe(
      'chat.directSubmit.networkError'
    )
  })
})
