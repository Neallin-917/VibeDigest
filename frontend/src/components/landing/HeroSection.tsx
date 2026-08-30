"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { ChatInput } from "@/components/chat/ChatInput"
import { useRouter } from "next/navigation"
import { Youtube, Apple, ExternalLink } from "lucide-react"
import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { isSupportedUrl } from "@/lib/urls"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import { DigestPreview } from "./DigestPreview"

export function HeroSection() {
    const { t } = useI18n()
    const router = useRouter()
    const [showUrlHelp, setShowUrlHelp] = useState(false)
    const {
        data: currentUser,
        isPending: isAccountPending,
        refetch: refetchCurrentUser,
    } = useCurrentUserQuery()

    const handleHeroSubmit = async (text: string) => {
        // Validate URL format for any non-empty input
        if (text.trim() && !isSupportedUrl(text)) {
            setShowUrlHelp(true)
            return
        }

        // Save message for handoff (works for both logged in and guest)
        localStorage.setItem('vibedigest_pending_message', text)

        let user = currentUser
        if (isAccountPending) {
            const result = await refetchCurrentUser()
            user = result.data ?? null
        }

        // Get current locale from URL or use default
        const locale = window.location.pathname.split('/')[1] || 'en'
        const chatPath = `/${locale}/chat`

        if (user) {
            // Logged in -> Go to chat
            router.push(chatPath)
        } else {
            // Not logged in -> Force Login (Hard Wall)
            // Preserve the intended chat destination through every auth method.
            router.push(`/${locale}/login?next=${encodeURIComponent(chatPath)}`)
        }
    }

    const renderWithBold = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g)
        return parts.map((part, index) => {
            if (part.startsWith("**") && part.endsWith("**")) {
                return <span key={index} className="font-semibold text-primary">{part.slice(2, -2)}</span>
            }
            return part
        })
    }

    return (
        <section id="hero" className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 md:pb-28 md:pt-36 lg:px-10 xl:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[linear-gradient(to_bottom,rgba(76,103,82,0.055),transparent_72%)]" />
            <div className="mx-auto w-full max-w-[1080px]">
                <div className="max-w-[760px]">
                    <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-strong">
                        <span className="h-px w-7 bg-primary/55" aria-hidden="true" />
                        {t("landing.badge")}
                    </p>
                    <h1 className="mt-5 max-w-[730px] text-[clamp(2.5rem,4.1vw,3.125rem)] font-semibold leading-[1.07] tracking-[-0.042em] text-foreground">
                        {t("landing.titlePrefix")}{" "}
                        <span className="text-primary">{t("landing.titleEmphasis")}</span>
                    </h1>

                    <p className="mt-6 max-w-[35rem] text-base leading-7 text-muted-foreground">
                        {renderWithBold(t("landing.smartSummarizationDesc"))}
                    </p>
                    <div className="mt-8 w-full max-w-[34rem]">
                        <div className="rounded-[14px] border border-border bg-card p-1.5 shadow-[0_10px_35px_-24px_rgba(31,41,34,0.28)]">
                            <ChatInput
                                variant="inline"
                                onSubmit={handleHeroSubmit}
                                placeholder={t("taskForm.urlPlaceholder")}
                                inputLabel={t("taskForm.urlInputLabel")}
                                hideDisclaimer={true}
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-14 sm:mt-16">
                    <DigestPreview />
                </div>
            </div>

            {/* Unsupported URL Dialog */}
            <Dialog open={showUrlHelp} onOpenChange={setShowUrlHelp}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ExternalLink className="w-5 h-5 text-primary" />
                            {t("taskForm.urlHelp.title")}
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            {t("taskForm.urlHelp.description")}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        <p className="mb-3 text-sm font-semibold text-foreground">
                            {t("taskForm.urlHelp.supportedPlatforms")}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5 text-sm text-muted-foreground">
                                <Youtube className="w-4 h-4 text-red-500" />
                                <span>YouTube</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5 text-sm text-muted-foreground">
                                <Apple className="w-4 h-4 text-purple-500" />
                                <span>Apple Podcasts</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5 text-sm text-muted-foreground">
                                <div className="w-4 h-4 rounded-sm bg-blue-400 flex items-center justify-center text-[10px] text-primary-foreground font-bold">B</div>
                                <span>Bilibili</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5 text-sm text-muted-foreground">
                                <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[10px] text-primary-foreground font-bold">X</div>
                                <span>{t("taskForm.urlHelp.xiaoyuzhou")}</span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button 
                            type="button" 
                            variant="secondary"
                            onClick={() => setShowUrlHelp(false)}
                            className="w-full sm:w-auto rounded-xl"
                        >
                            {t("taskForm.urlHelp.gotIt")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    )
}
