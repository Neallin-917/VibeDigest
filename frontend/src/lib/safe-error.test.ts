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
})
