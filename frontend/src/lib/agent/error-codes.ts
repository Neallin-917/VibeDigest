export const AGENT_QUOTA_EXCEEDED_CODE = 'quota_exceeded' as const
export const AGENT_QUOTA_EXCEEDED_SIGNAL = 'VIBEDIGEST_QUOTA_EXCEEDED' as const

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined
}

function statusFrom(error: unknown, depth = 0): number | undefined {
  const record = asRecord(error)
  if (!record || depth > 4) return undefined
  if (typeof record.status === 'number') return record.status
  if (typeof record.statusCode === 'number') return record.statusCode
  const response = asRecord(record.response)
  if (response && typeof response.status === 'number') return response.status
  return statusFrom(record.cause, depth + 1)
}

function errorText(error: unknown, depth = 0): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  const record = asRecord(error)
  if (!record || depth > 4) return ''

  const fields = ['message', 'details', 'error'] as const
  const own = fields.flatMap(field => typeof record[field] === 'string' ? [record[field]] : [])
  return `${own.join(' ')} ${errorText(record.cause, depth + 1)}`.trim()
}

export function isAgentQuotaExceededError(error: unknown): boolean {
  if (statusFrom(error) === 402) return true

  const text = errorText(error)
  return text.includes(AGENT_QUOTA_EXCEEDED_SIGNAL)
    || /["']?code["']?\s*:\s*["']quota_exceeded["']/i.test(text)
    || /the task allowance has been reached/i.test(text)
}
