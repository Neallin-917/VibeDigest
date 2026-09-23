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
        <section id="hero" className="px-5 pt-8 md:px-8 md:pt-[76px]">
            <div className="mx-auto w-full max-w-[1200px]">
                <div className="mx-auto max-w-[1200px] text-center">
                    <h1 className={cn(
                        "font-semibold text-foreground md:text-[clamp(36px,4.4vw,64px)] md:leading-[1.12] md:tracking-[-2.3px]",
                        locale === "zh"
                            ? "text-[32px] leading-[1.25] tracking-[-1.1px] max-[359px]:text-[29px]"
                            : "text-[30px] leading-[1.18] tracking-[-1.1px] max-[359px]:text-[27px]"
                    )}>
                        <span className="block">{t("landing.titlePrefix")}</span>
                        <span className="block text-primary">{t("landing.titleEmphasis")}</span>
                    </h1>
                    <div className="mx-auto mt-[22px] w-full max-w-[760px] md:mt-[30px]">
                        <ChatInput
                            variant="landing"
                            onSubmit={handleHeroSubmit}
                            onInputChange={() => setHasUrlError(false)}
                            error={hasUrlError ? t("taskForm.urlHelp.description") : undefined}
                            placeholder={t("taskForm.urlPlaceholder")}
                            inputLabel={t("taskForm.urlInputLabel")}
                            hideDisclaimer={true}
                        />
                    </div>
                </div>
                <div className="mt-7 md:mt-8">
                    <DigestPreview />
                </div>
            </div>
        </section>
    )
}
