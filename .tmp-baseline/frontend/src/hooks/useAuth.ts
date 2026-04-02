import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { env } from "@/env"

/**
 * Hook to detect authentication state.
 * Returns null while loading, true/false once resolved.
 * Supports E2E test mode via VIBEDIGEST_E2E_AUTH_BYPASS cookie.
 */
export function useAuth(): { isAuthenticated: boolean | null } {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
        if (typeof document !== 'undefined' && env.NEXT_PUBLIC_E2E_MOCK === '1') {
            return document.cookie
                .split(';')
                .some(c => c.trim() === 'VIBEDIGEST_E2E_AUTH_BYPASS=true')
        }
        return null
    })
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        if (env.NEXT_PUBLIC_E2E_MOCK === '1') {
            return
        }
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsAuthenticated(!!user)
        })
    }, [supabase])

    return { isAuthenticated }
}
