import { describe, expect, it } from 'vitest'
import { normalizeTaskStatus, sanitizeErrorMessage } from './safe-error'

const cloudflareChallengeHtml = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>`

describe('safe-error', () => {
  it('replaces anti-bot challenge HTML with a user-safe message', () => {
    const message = sanitizeErrorMessage(cloudflareChallengeHtml)

    expect(message).toContain('blocking automated access')
    expect(message).not.toContain('<!DOCTYPE')
    expect(message).not.toContain('challenge-platform')
  })

  it('normalizes backend terminal error status for UI components', () => {
    expect(normalizeTaskStatus('error')).toBe('failed')
  })

  it('replaces provider internals with the caller-facing fallback', () => {
    const message = sanitizeErrorMessage(
      'litellm.BadGatewayError: OpenAIException - unknown provider for model claude-sonnet-4-6',
      '暂时无法处理这个视频，请稍后重试。'
    )

    expect(message).toBe('暂时无法处理这个视频，请稍后重试。')
  })

  it('uses the caller-owned English fallback instead of an unknown message', () => {
    const message = sanitizeErrorMessage(
      new Error('Provider request 42 failed with an undocumented response'),
      'Something went wrong.'
    )

    expect(message).toBe('Something went wrong.')
    expect(message).not.toContain('Provider request 42')
  })

  it.each([
    'PRIVATE_TOKEN=do-not-display',
    '{"error":"database host internal.example:5432","request_id":"secret-request"}',
    '<html><body><script>window.secret = "do-not-display"</script></body></html>',
    'Error: upstream failed\n    at privateFunction (/srv/app/provider.ts:42:7)',
    new Error('予期しない英語以外の上流エラー'),
  ])('does not expose unknown upstream details', input => {
    const message = sanitizeErrorMessage(input, 'エラーが発生しました。もう一度お試しください。')

    expect(message).toBe('エラーが発生しました。もう一度お試しください。')
    expect(message).not.toContain('PRIVATE_TOKEN')
    expect(message).not.toContain('internal.example')
    expect(message).not.toContain('window.secret')
    expect(message).not.toContain('/srv/app')
    expect(message).not.toContain('上流エラー')
  })
})
