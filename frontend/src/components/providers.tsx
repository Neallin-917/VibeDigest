"use client"

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { I18nProvider } from "@/components/i18n/I18nProvider"
import type { Locale, Messages } from "@/lib/i18n"
import { accountKeys } from "@/hooks/useAccountQueries"
import { createClient } from "@/lib/supabase"
import { isLocalUiDemo } from "@/lib/local-ui-demo"

function AccountSessionSync() {
    const queryClient = useQueryClient()
    const isDemo = isLocalUiDemo()
    const supabase = useMemo(() => (isDemo ? null : createClient()), [isDemo])

    useEffect(() => {
        if (!supabase) return

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            // Render the browser session immediately while useCurrentUserQuery
            // continues its server-validated lookup in the background.
            queryClient.setQueryData(accountKeys.currentUser, session?.user ?? null)
            if (!session) {
                queryClient.removeQueries({ queryKey: accountKeys.profiles })
            }
        })

        return () => subscription.unsubscribe()
    }, [queryClient, supabase])

    return null
}

export function Providers({
    children,
    locale,
    messages,
}: {
    children: React.ReactNode
    locale: Locale
    messages: Messages
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    }))
    return (
        <QueryClientProvider client={queryClient}>
            <AccountSessionSync />
            <I18nProvider locale={locale} messages={messages}>
                {children}
            </I18nProvider>
        </QueryClientProvider>
    )
}
