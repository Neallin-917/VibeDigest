"use client"

import { useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase"
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
    const initializedRef = useRef(false)
    const scriptRef = useRef<HTMLScriptElement | null>(null)

    useEffect(() => {
        // Prevent double initialization in React Strict Mode
        if (initializedRef.current) return
        initializedRef.current = true

        const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        if (!clientId) {
            console.warn("Google One Tap: Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID")
            return
        }

        // Check if user is already logged in
        const checkAuthAndInitialize = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                // Already logged in, don't show One Tap
                return
            }

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
                        console.error("One Tap sign-in error:", error.message)
                        toast.error(`Sign in failed: ${error.message}`)
                        return
                    }

                    if (data.session) {
                        console.log("One Tap sign-in successful")
                        toast.success("Signed in successfully!")
                        window.location.reload()
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : "An unexpected error occurred."
                    console.error("One Tap error:", err)
                    toast.error(`Sign in failed: ${message}`)
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

                // Show the One Tap prompt
                window.google.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed()) {
                        console.log("One Tap not displayed:", notification.getNotDisplayedReason())
                    }
                    if (notification.isSkippedMoment()) {
                        console.log("One Tap skipped:", notification.getSkippedReason())
                    }
                })
            }

            scriptRef.current = script
            document.body.appendChild(script)
        }

        checkAuthAndInitialize()

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
    }, [supabase])

    // This component doesn't render anything visually
    return null
}
