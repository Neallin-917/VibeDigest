import { NextResponse, type NextRequest } from 'next/server'
import { match } from '@formatjs/intl-localematcher'
import Negotiator from 'negotiator'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/env'
import { updateSession } from '@/lib/supabase/proxy'

const SUPPORTED_LOCALES = ["en", "zh", "ja"]
const DEFAULT_LOCALE = "en"

const PROTECTED_ROUTES = ['/history', '/settings']
const PUBLIC_ROUTES = ['/login', '/auth', '/register', '/faq', '/explore', '/terms', '/privacy', '/about', '/chat']

function getLocale(request: NextRequest): string {
  const headers = { 'accept-language': request.headers.get('accept-language') || '' }
  const languages = new Negotiator({ headers }).languages()
  try {
    return match(languages, SUPPORTED_LOCALES, DEFAULT_LOCALE)
  } catch (e) {
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

  // 1. Initialize session and refresh cookies
  let { response, user } = await updateSession(request)

  // API routes: session cookies are already refreshed in 'response'
  if (pathname.startsWith('/api')) {
    return response
  }

  const pathParts = pathname.split('/')
  const pathLocale = SUPPORTED_LOCALES.find(l => pathParts[1] === l)
  
  const locale = pathLocale || DEFAULT_LOCALE
  let pathWithoutLocale = pathLocale ? '/' + pathParts.slice(2).join('/') : pathname
  if (!pathWithoutLocale.startsWith('/')) pathWithoutLocale = '/' + pathWithoutLocale

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
