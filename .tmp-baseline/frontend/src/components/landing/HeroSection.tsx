"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { ChatInput } from "@/components/chat/ChatInput"
import { useRouter } from "next/navigation"
import { ChevronDown, Youtube, Apple, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
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

import { createBrowserClient } from "@supabase/ssr"
import { env } from "@/env"

export function HeroSection() {
    const { t } = useI18n()
    const router = useRouter()
    const [showUrlHelp, setShowUrlHelp] = useState(false)
    
    // Initialize Supabase client for client-side auth check
    const supabase = createBrowserClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const handleHeroSubmit = async (text: string) => {
        // Validate URL format for any non-empty input
        if (text.trim() && !isSupportedUrl(text)) {
            setShowUrlHelp(true)
            return
        }

        // Save message for handoff (works for both logged in and guest)
        localStorage.setItem('vibedigest_pending_message', text)

        let session = null
        try {
            // Check if user is logged in
            const { data } = await supabase.auth.getSession()
            session = data?.session
        } catch (error) {
            console.error('Supabase session check failed:', error)
            // Proceed as guest if check fails
        }

        // Get current locale from URL or use default
        const locale = window.location.pathname.split('/')[1] || 'en'

        if (session) {
            // Logged in -> Go to chat
            router.push(`/${locale}/chat`)
        } else {
            // Not logged in -> Force Login (Hard Wall)
            // Redirect to login page with locale
            router.push(`/${locale}/login`)
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
        <section id="hero" className="bg-noise flex flex-col items-center justify-center px-6 pt-28 pb-16 md:pt-40 md:pb-24 text-center relative z-10 min-h-[85vh]">
            <div className="space-y-6 max-w-4xl relative">

                {/* Badge/Pill */}
                <div
                    className={cn(
                        "inline-flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md shadow-sm mb-6 transition-all hover:scale-105 cursor-default",
                        "bg-white/40 border border-white/60",
                        "dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]",
                        "animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out"
                    )}
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                    </span>
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 tracking-wide uppercase">{t("landing.badge")}</span>
                </div>

                <h1
                    className="font-display text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.1] md:leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out fill-mode-backwards delay-100"
                >
                    {t("landing.titlePrefix")}{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-600 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-300 animate-pulse-glow">
                        {t("landing.titleEmphasis")}
                    </span>
                </h1>

                <p
                    className="max-w-xl mx-auto text-base md:text-lg leading-relaxed text-slate-600 dark:text-zinc-400 font-light animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out fill-mode-backwards delay-200"
                >
                    {renderWithBold(t("landing.smartSummarizationDesc"))}
                </p>
            </div>

            <div
                className="w-full max-w-2xl z-20 mt-12 px-4 animate-in fade-in slide-in-from-bottom-8 zoom-in-95 duration-1000 ease-out fill-mode-backwards delay-300"
            >
                <div className="relative group perspective-1000">
                    {/* Glow Effect */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600/20 via-teal-600/20 to-emerald-600/20 dark:from-emerald-500/20 dark:via-teal-500/20 dark:to-cyan-500/20 rounded-full blur-xl opacity-60 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />

                    {/* Input Container */}
                    <div className="relative">
                        <ChatInput 
                            variant="inline"
                            onSubmit={handleHeroSubmit}
                            showTypewriter={true}
                            hideDisclaimer={true}
                        />
                    </div>
                </div>

                <p className="mt-5 text-xs text-slate-500 dark:text-zinc-500">
                    {t("landing.trustedBy")}
                </p>
            </div>

            {/* Scroll Indicator */}
            <div
                className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-in fade-in delay-1000 duration-1000"
            >
                <ChevronDown className="w-6 h-6 text-slate-400 dark:text-zinc-500 animate-bounce" />
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
