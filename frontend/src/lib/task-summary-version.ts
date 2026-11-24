import { isLocale, type Locale } from '@/lib/i18n'
import type { SummaryOutputCandidate } from '@/lib/summary-contract'

export function explicitSummaryLocale(intent: unknown): Locale | null {
  if (!intent || typeof intent !== 'object') return null
  const preference = intent as Record<string, unknown>
  const preferred = preference.preferred_summary_locale
  if (typeof preferred === 'string' && isLocale(preferred)) return preferred
  const target = preference.target_locale
  return preference.locale_source === 'explicit_instruction' && typeof target === 'string' && isLocale(target)
    ? target : null
}

// Call only for a completed owner's task when no valid target digest is ready.
export function missingSummaryVersionStatus(outputs: SummaryOutputCandidate[], target: Locale, explicit: Locale | null) {
  const version = outputs.find(output => output.kind === 'summary' && output.locale === target)
  if (version?.status === 'pending' || version?.status === 'processing') return 'waiting'
  return version || explicit ? 'unavailable' : 'request'
}
