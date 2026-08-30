import { describe, expect, it } from 'vitest'

import {
  AGENT_QUOTA_EXCEEDED_SIGNAL,
  isAgentQuotaExceededError,
} from './error-codes'

describe('Agent error codes', () => {
  it.each([
    { status: 402 },
    { response: { status: 402 } },
    { cause: { statusCode: 402 } },
    new Error(AGENT_QUOTA_EXCEEDED_SIGNAL),
    new Error('{"error":"allowance reached","code":"quota_exceeded"}'),
    new Error('The task allowance has been reached.'),
  ])('recognizes quota exhaustion without exposing provider details', error => {
    expect(isAgentQuotaExceededError(error)).toBe(true)
  })

  it('does not turn an unrelated service failure into a billing prompt', () => {
    expect(isAgentQuotaExceededError(new Error('The Agent service is temporarily unavailable.'))).toBe(false)
  })
})
