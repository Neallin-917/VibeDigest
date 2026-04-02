import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { env } from '@/env'

const DEFAULT_LANG = 'en'

function resolveLang(searchParams: URLSearchParams, nextPath: string | null) {
    const paramLang = searchParams.get('lang')
    if (paramLang) return paramLang

    if (nextPath && nextPath.startsWith('/')) {
        const segment = nextPath.split('/')[1]
        if (segment && segment.length === 2) return segment
    }

    return DEFAULT_LANG
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const nextPath = searchParams.get('next')
    const lang = resolveLang(searchParams, nextPath)
    const next = nextPath ?? `/${lang}/chat`

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            env.NEXT_PUBLIC_SUPABASE_URL,
            env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        )
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = env.NODE_ENV === 'development'
            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            }
            return NextResponse.redirect(`${origin}${next}`)
        }

        console.error('Auth callback error:', error)
        return NextResponse.redirect(`${origin}/${lang}/login?error=${encodeURIComponent(error.message)}`)
    }

    return NextResponse.redirect(`${origin}/${lang}/login?message=Could not login with provider&reason=no_code`)
}
