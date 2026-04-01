"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { I18nProvider } from "@/components/i18n/I18nProvider"
import { isLocale } from "@/lib/i18n"

import { ThemeProvider } from "next-themes"

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
