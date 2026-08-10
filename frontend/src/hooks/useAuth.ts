import { env } from "@/env"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import { isLocalUiDemo } from "@/lib/local-ui-demo"

/**
 * Hook to detect authentication state.
 * Returns null while loading, true/false once resolved.
 * Supports E2E test mode via VIBEDIGEST_E2E_AUTH_BYPASS cookie.
 */
export function useAuth(): { isAuthenticated: boolean | null } {
    const isE2E = env.NEXT_PUBLIC_E2E_MOCK === "1"
    const isDemo = isLocalUiDemo()
    const hasE2EBypass = isE2E && typeof document !== "undefined"
        ? document.cookie
            .split(";")
            .some((cookie) => cookie.trim() === "VIBEDIGEST_E2E_AUTH_BYPASS=true")
        : false
    const { data: user, isLoading } = useCurrentUserQuery({ enabled: !isE2E && !isDemo })

    if (isDemo) {
        return { isAuthenticated: true }
    }

    if (isE2E) {
        return { isAuthenticated: hasE2EBypass }
    }

    return { isAuthenticated: isLoading ? null : Boolean(user) }
}
