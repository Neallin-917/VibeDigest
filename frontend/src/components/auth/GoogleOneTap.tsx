"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase"
import { useI18n } from "@/components/i18n/I18nProvider"
import { accountKeys, useCurrentUserQuery } from "@/hooks/useAccountQueries"
import { toast } from "sonner"
import { env } from "@/env"

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: {
                        client_id: string
                        callback: (response: { credential: string }) => void
                        auto_select?: boolean
                        cancel_on_tap_outside?: boolean
                        context?: string
                        itp_support?: boolean
                        nonce?: string
                    }) => void
                    prompt: (callback?: (notification: {
                        isNotDisplayed: () => boolean
                        isSkippedMoment: () => boolean
                        isDismissedMoment: () => boolean
                        getNotDisplayedReason: () => string
                        getSkippedReason: () => string
                        getDismissedReason: () => string
                    }) => void) => void
                    cancel: () => void
                    disableAutoSelect: () => void
                    revoke: (email: string, callback?: () => void) => void
                }
            }
        }
    }
}

/**
 * Generates a random nonce and its SHA-256 hash.
 * The raw nonce is sent to Supabase, while the hashed nonce is sent to Google.
 */
async function generateNonce(): Promise<{ rawNonce: string; hashedNonce: string }> {
    const rawNonce = crypto.randomUUID()
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawNonce))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    return { rawNonce, hashedNonce }
}

export function GoogleOneTap() {
    const supabase = useMemo(() => createClient(), [])
    const queryClient = useQueryClient()
    const { t } = useI18n()
    const { data: user, isPending } = useCurrentUserQuery()
    const initializedRef = useRef(false)
    const scriptRef = useRef<HTMLScriptElement | null>(null)

    useEffect(() => {
        if (isPending || user) return

        // Prevent double initialization in React Strict Mode
        if (initializedRef.current) return
        initializedRef.current = true

        const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        if (!clientId) {
            console.warn("Google One Tap: Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID")
            return
        }

        const initializeOneTap = async () => {
            // Generate nonce for token verification
            const { rawNonce, hashedNonce } = await generateNonce()

            const handleCredentialResponse = async (response: { credential: string }) => {
                try {
                    const { data, error } = await supabase.auth.signInWithIdToken({
                        provider: "google",
                        token: response.credential,
                        nonce: rawNonce,
                    })

                    if (error) {
                        console.error("Google One Tap sign-in failed")
                        toast.error(t("auth.errors.generic"))
                        return
                    }

                    if (data.session) {
                        queryClient.setQueryData(accountKeys.currentUser, data.user)
                        window.google?.accounts.id.cancel()
                        toast.success(t("auth.signInSuccess"))
                    }
                } catch {
                    console.error("Google One Tap sign-in failed")
                    toast.error(t("auth.errors.generic"))
                }
            }

            // Load Google Identity Services script
            const script = document.createElement("script")
            script.src = "https://accounts.google.com/gsi/client"
            script.async = true
            script.defer = true
            script.onload = () => {
                if (!window.google) return

                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleCredentialResponse,
                    auto_select: true,
                    cancel_on_tap_outside: true,
                    context: "signin",
                    itp_support: true,
                    nonce: hashedNonce,
                })

                // Show the prompt without relying on legacy display-moment callbacks.
                window.google.accounts.id.prompt()
            }

            scriptRef.current = script
            document.body.appendChild(script)
        }

        void initializeOneTap()

        // Cleanup runs when component unmounts
        return () => {
            if (window.google) {
                window.google.accounts.id.cancel()
            }
            if (scriptRef.current) {
                scriptRef.current.remove()
                scriptRef.current = null
            }
        }
    }, [isPending, queryClient, supabase, t, user])

    // This component doesn't render anything visually
    return null
}
