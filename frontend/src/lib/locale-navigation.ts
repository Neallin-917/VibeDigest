import { isLocale, type Locale } from '@/lib/i18n'

const INTERNAL_ORIGIN = 'https://vibedigest.invalid'

/** Accept a local app path only, including its query and fragment. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return null
  try {
    const url = new URL(value, INTERNAL_ORIGIN)
    return url.origin === INTERNAL_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}

export function localizePath(value: string, locale: Locale): string {
  const url = new URL(safeReturnPath(value) ?? '/', INTERNAL_ORIGIN)
  const segments = url.pathname.split('/')
  if (isLocale(segments[1])) segments[1] = locale
  else segments.splice(1, 0, locale)
  return `${segments.join('/')}${url.search}${url.hash}`
}

export function localeSwitchHref(value: string, locale: Locale): string {
  const url = new URL(localizePath(value, locale), INTERNAL_ORIGIN)
  const returnPath = url.searchParams.get('next')
  if (returnPath !== null) {
    const safePath = safeReturnPath(returnPath)
    if (safePath) url.searchParams.set('next', localizePath(safePath, locale))
    else url.searchParams.delete('next')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function authCallbackUrl(origin: string, locale: Locale, next?: string | null): string {
  const callback = new URL(`/${locale}/auth/callback`, origin)
  callback.searchParams.set('next', localizePath(safeReturnPath(next) ?? `/${locale}/chat`, locale))
  return callback.toString()
}
