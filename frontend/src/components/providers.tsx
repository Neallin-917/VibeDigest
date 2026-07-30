"use client"

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { I18nProvider } from "@/components/i18n/I18nProvider"
import { isLocale } from "@/lib/i18n"
import { accountKeys } from "@/hooks/useAccountQueries"
import { createClient } from "@/lib/supabase"

import { ThemeProvider } from "next-themes"

function AccountSessionSync() {
    const queryClient = useQueryClient()
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
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

export function Providers({ children, locale }: { children: React.ReactNode, locale?: string }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    }))
    const safeLocale = locale && isLocale(locale) ? locale : undefined

    return (
        <QueryClientProvider client={queryClient}>
            <AccountSessionSync />
            <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                disableTransitionOnChange
            >
                <I18nProvider locale={safeLocale}>
                    {children}
                </I18nProvider>
            </ThemeProvider>
        </QueryClientProvider>
    )
}
