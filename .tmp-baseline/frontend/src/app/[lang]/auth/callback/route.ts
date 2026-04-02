import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { env } from '@/env'

export async function GET(request: Request, { params }: { params: Promise<{ lang: string }> }) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const { lang } = await params
    const next = searchParams.get('next') ?? `/${lang}/chat`

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
            const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
            const isLocalEnv = env.NODE_ENV === 'development'
            if (isLocalEnv) {
                // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
                return NextResponse.redirect(`${origin}${next}`)
            }
        } else {
            console.error('Auth callback error:', error)
            return NextResponse.redirect(`${origin}/${lang}/login?error=${encodeURIComponent(error.message)}`)
        }
    } else {
        console.log('No code found in auth callback URL')
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/${lang}/login?message=Could not login with provider&reason=no_code`)
}
