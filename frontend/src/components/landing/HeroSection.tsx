"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { ChatInput } from "@/components/chat/ChatInput"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { getSupportedUrlDetails } from "@/lib/urls"
import { trackGrowthEvent } from "@/lib/growth-events"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import { DigestPreview } from "./DigestPreview"

export function HeroSection() {
    const { t, locale } = useI18n()
    const router = useRouter()
    const [hasUrlError, setHasUrlError] = useState(false)
    const {
        data: currentUser,
        isPending: isAccountPending,
        refetch: refetchCurrentUser,
    } = useCurrentUserQuery()

    const handleHeroSubmit = async (text: string) => {
        const source = getSupportedUrlDetails(text)
        if (!source) {
            setHasUrlError(true)
            return false
        }
        setHasUrlError(false)

        // Save message for handoff (works for both logged in and guest)
        localStorage.setItem('vibedigest_pending_message', text)

        let user = currentUser
        if (isAccountPending) {
            const result = await refetchCurrentUser()
            user = result.data ?? null
        }

        const chatPath = `/${locale}/chat`
        const destination = user ? "chat" : "login"

        trackGrowthEvent("landing_agent_intent", {
            locale,
            destination,
            source: source.source,
        })

        if (user) {
            // Logged in -> Go to chat
            router.push(chatPath)
        } else {
            // Preserve the intended chat destination through every auth method.
            router.push(`/${locale}/login?next=${encodeURIComponent(chatPath)}`)
        }
    }

    return (
        <section id="hero" className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 md:pb-28 md:pt-36 lg:px-10 xl:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[linear-gradient(to_bottom,rgba(76,103,82,0.055),transparent_72%)]" />
            <div className="mx-auto w-full max-w-[1080px]">
                <div className="max-w-[760px]">
                    <h1 className={cn(
                        "max-w-[730px] font-semibold text-foreground",
                        locale === "zh"
                            ? "text-balance text-[clamp(2rem,4.1vw,3.125rem)] leading-[1.2] tracking-[-0.02em]"
                            : "text-[clamp(2.5rem,4.1vw,3.125rem)] leading-[1.07] tracking-[-0.042em]"
                    )}>
                        <span className={locale === "zh" ? "inline-block whitespace-nowrap" : undefined}>
                            {t("landing.titlePrefix")}
                        </span>{" "}
                        <span className={cn("text-primary", locale === "zh" && "inline-block whitespace-nowrap")}>
                            {t("landing.titleEmphasis")}
                        </span>
                    </h1>

                    <div className="mt-8 w-full max-w-[34rem]">
                        <ChatInput
                            variant="inline"
                            onSubmit={handleHeroSubmit}
                            onInputChange={() => setHasUrlError(false)}
                            error={hasUrlError ? t("taskForm.urlHelp.description") : undefined}
                            placeholder={t("taskForm.urlPlaceholder")}
                            inputLabel={t("taskForm.urlInputLabel")}
                            hideDisclaimer={true}
                        />
                    </div>
                </div>

                <div className="mt-14 sm:mt-16">
                    <DigestPreview />
                </div>
            </div>
        </section>
    )
}
