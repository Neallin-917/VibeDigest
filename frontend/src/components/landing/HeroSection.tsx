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
                return <span key={index} className="text-emerald-700 dark:text-emerald-400 font-semibold drop-shadow-sm">{part.slice(2, -2)}</span>
            }
            return part
        })
    }

    return (
        <section id="hero" className="relative overflow-hidden px-6 pb-16 pt-24 md:pb-24 md:pt-24">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.13),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.11),transparent_62%)]" />
            <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1fr)] lg:gap-20">
                <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
                    <p className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                        {t("landing.badge")}
                    </p>
                    <h1 className="mt-5 font-display text-4xl font-bold leading-[1.03] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
                        {t("landing.titlePrefix")}{" "}
                        <span className="text-emerald-700 dark:text-emerald-300">{t("landing.titleEmphasis")}</span>
                    </h1>

                    <p className="mx-auto mt-6 max-w-[32rem] text-base leading-relaxed text-slate-600 md:text-lg lg:mx-0 dark:text-zinc-400">
                        {renderWithBold(t("landing.smartSummarizationDesc"))}
                    </p>
                    <div className="mx-auto mt-9 w-full max-w-xl lg:mx-0">
                        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_50px_-30px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-zinc-950">
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

                <DigestPreview />
            </div>

            {/* Unsupported URL Dialog */}
            <Dialog open={showUrlHelp} onOpenChange={setShowUrlHelp}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ExternalLink className="w-5 h-5 text-emerald-500" />
                            {t("taskForm.urlHelp.title")}
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            {t("taskForm.urlHelp.description")}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        <p className="text-sm font-semibold mb-3 text-slate-900 dark:text-slate-200">
                            {t("taskForm.urlHelp.supportedPlatforms")}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-100 dark:border-white/5">
                                <Youtube className="w-4 h-4 text-red-500" />
                                <span>YouTube</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-100 dark:border-white/5">
                                <Apple className="w-4 h-4 text-purple-500" />
                                <span>Apple Podcasts</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-100 dark:border-white/5">
                                <div className="w-4 h-4 rounded-sm bg-blue-400 flex items-center justify-center text-[10px] text-white font-bold">B</div>
                                <span>Bilibili</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-100 dark:border-white/5">
                                <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[10px] text-white font-bold">X</div>
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
