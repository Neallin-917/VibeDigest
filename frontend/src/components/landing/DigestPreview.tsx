"use client"

import Link from "next/link"
import { ArrowUpRight, CheckCircle2, FileText, MessageCircleQuestion, Sparkles } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"

/** A product-accurate preview of VibeDigest's Brief → key points → follow-up flow. */
export function DigestPreview() {
    const { locale, t } = useI18n()

    return (
        <section
            aria-labelledby="digest-preview-title"
            className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_24px_80px_-44px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-zinc-950 dark:shadow-[0_24px_80px_-44px_rgba(0,0,0,0.9)]"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent" />

            <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10 sm:px-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                            <FileText className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-500">
                                {t("landing.previewKicker")}
                            </p>
                            <h2 id="digest-preview-title" className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                {t("landing.previewTitle")}
                            </h2>
                        </div>
                    </div>
                    <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200 sm:flex">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("landing.previewReady")}
                    </span>
                </div>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-500">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                        {t("landing.previewBriefLabel")}
                    </div>
                    <p className="text-[15px] leading-6 text-slate-700 dark:text-zinc-300">{t("landing.previewBrief")}</p>
                </div>

                <div className="space-y-3 border-y border-slate-100 py-4 dark:border-white/10">
                    {["previewPointOne", "previewPointTwo"].map((key, index) => (
                        <div key={key} className="flex gap-3">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-zinc-300">
                                {index + 1}
                            </span>
                            <p className="text-sm leading-5 text-slate-600 dark:text-zinc-400">{t(`landing.${key}`)}</p>
                        </div>
                    ))}
                </div>

                <div className="rounded-2xl bg-slate-50 p-3.5 dark:bg-white/[0.045]">
                    <div className="flex gap-2.5">
                        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" strokeWidth={1.8} />
                        <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{t("landing.previewQuestion")}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-500">{t("landing.previewAnswer")}</p>
                        </div>
                    </div>
                </div>
            </div>

            <Link
                href={`/${locale}/explore`}
                className="group flex items-center justify-between border-t border-slate-100 px-5 py-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.045] dark:hover:text-white sm:px-6"
            >
                <span>{t("landing.previewOpen")}</span>
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
        </section>
    )
}
