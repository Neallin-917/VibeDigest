import { NextResponse, type NextRequest } from 'next/server'
import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'
import { updateSession } from '@/lib/supabase/proxy'
import { COOKIE_NAME, DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale } from '@/lib/i18n'

const PROTECTED_ROUTES = ['/history', '/settings']
const PUBLIC_ROUTES = ['/login', '/auth', '/register', '/faq', '/explore', '/terms', '/privacy', '/about', '/chat']
const CHAT_HISTORY_MESSAGES_PATH = /^\/api\/chat\/threads\/[^/]+\/messages$/
const isLocalUiDemo = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEMO === '1'

function isAuthenticatedChatHistoryRead(request: NextRequest) {
  const { pathname } = request.nextUrl
  return request.method === 'GET' && (
    pathname === '/api/threads' || CHAT_HISTORY_MESSAGES_PATH.test(pathname)
  )
}

function getLocale(request: NextRequest): string {
  const savedLocale = request.cookies.get(COOKIE_NAME)?.value
  if (isLocale(savedLocale)) return savedLocale

  const headers = { 'accept-language': request.headers.get('accept-language') || '' }
  const languages = new Negotiator({ headers }).languages()
  try {
    return match(languages, SUPPORTED_LOCALES, DEFAULT_LOCALE)
  } catch {
    return DEFAULT_LOCALE
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets: skip entirely (no auth needed)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // The two history reads below validate the user and thread ownership in their
  // route handlers. Skipping this duplicate Auth round-trip keeps reopening a
  // conversation responsive while all other API paths retain session refresh.
  if (pathname.startsWith('/api')) {
    if (isLocalUiDemo) {
      return NextResponse.next()
    }

    if (isAuthenticatedChatHistoryRead(request)) {
      return NextResponse.next()
    }

    const { response } = await updateSession(request)
    return response
  }

  const pathParts = pathname.split('/')
  const pathLocale = SUPPORTED_LOCALES.find(l => pathParts[1] === l)
  const locale = pathLocale || DEFAULT_LOCALE
  let pathWithoutLocale = pathLocale ? '/' + pathParts.slice(2).join('/') : pathname
  if (!pathWithoutLocale.startsWith('/')) pathWithoutLocale = '/' + pathWithoutLocale

  // Chat renders from public examples and resolves the browser session after
  // hydration. Avoid an extra remote Auth round-trip before this public page
  // can render; API routes still refresh cookies and validate the user.
  if (pathWithoutLocale === '/chat') {
    if (!pathLocale) {
      const detectedLocale = getLocale(request)
      const newUrl = new URL(`/${detectedLocale}${pathname}`, request.url)
      request.nextUrl.searchParams.forEach((v, k) => newUrl.searchParams.set(k, v))
      return NextResponse.redirect(newUrl)
    }

    return NextResponse.next()
  }

  // Initialize the session before any route that requires server-side auth.
  const { response, user } = await updateSession(request)

  if (!pathLocale) {
    const detectedLocale = getLocale(request)
    const newUrl = new URL(`/${detectedLocale}${pathname}`, request.url)
    request.nextUrl.searchParams.forEach((v, k) => newUrl.searchParams.set(k, v))
    const redirectResponse = NextResponse.redirect(newUrl)
    // Copy session cookies from updateSession response
    response.cookies.getAll().forEach(c => redirectResponse.cookies.set(c.name, c.value, c))
    return redirectResponse
  }

  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathWithoutLocale.startsWith(route))
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathWithoutLocale.startsWith(route)) || pathWithoutLocale === '/'

  if (isProtectedRoute && !isPublicRoute) {
    // E2E Support: Only bypass if specific auth-bypass cookie is present.
    // This allows setup to pass, but guest tests will still be correctly blocked.
    // NOTE: request.cookies.get returns an object { name, value }, we need .value
    const hasBypassCookie = request.cookies.get('VIBEDIGEST_E2E_AUTH_BYPASS')?.value === 'true'
    
    // If no user AND no bypass cookie, block access
    if (!user && !hasBypassCookie) {
      const loginUrl = new URL(`/${locale}/login`, request.url)
      const redirectResponse = NextResponse.redirect(loginUrl)
      // Copy session cookies from updateSession response
      response.cookies.getAll().forEach(c => redirectResponse.cookies.set(c.name, c.value, c))
      return redirectResponse
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
