const DEFAULT_ERROR_MESSAGE = 'Unable to process this video right now.'
const UPSTREAM_BLOCKED_MESSAGE =
  'The processing service is blocking automated access. Please try again later.'
const UPSTREAM_HTML_MESSAGE =
  'The upstream service returned an unexpected error page. Please try again later.'

export type NormalizedTaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractMessage(value: unknown): string | null {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (!isRecord(value)) return null

  for (const key of ['detail', 'details', 'error', 'message']) {
    const candidate = value[key]
    if (typeof candidate === 'string') return candidate
  }

  return null
}

function looksLikeHtml(value: string) {
  return /<!doctype\s+html/i.test(value) || /<html[\s>]/i.test(value) || /<script[\s>]/i.test(value)
}

function looksLikeAntiBotChallenge(value: string) {
  return /cloudflare|challenge-platform|cf-chl|cdn-cgi|just a moment|challenge-error-text/i.test(value)
}

function tryParseJsonMessage(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  try {
    return extractMessage(JSON.parse(trimmed))
  } catch {
    return null
  }
}

export function sanitizeErrorMessage(input: unknown, safeFallback = DEFAULT_ERROR_MESSAGE): string {
  const fallback = safeFallback.trim() || DEFAULT_ERROR_MESSAGE
  const extracted = extractMessage(input)
  const parsed = typeof extracted === 'string' ? tryParseJsonMessage(extracted) : null
  const raw = (parsed ?? extracted ?? '').trim()

  if (!raw) return fallback

  if (safeFallback === DEFAULT_ERROR_MESSAGE && looksLikeHtml(raw)) {
    return looksLikeAntiBotChallenge(raw) ? UPSTREAM_BLOCKED_MESSAGE : UPSTREAM_HTML_MESSAGE
  }

  // Error text can contain provider names, request details, credentials, or a
  // message in a language unrelated to the active route. Only caller-owned,
  // localized copy is safe to render. Known actionable errors are classified
  // by their call sites before reaching this boundary.
  return fallback
}

export function normalizeTaskStatus(status: unknown): NormalizedTaskStatus {
  if (status === 'completed') return 'completed'
  if (status === 'processing') return 'processing'
  if (status === 'failed' || status === 'error') return 'failed'
  return 'pending'
}
