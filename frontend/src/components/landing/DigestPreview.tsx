"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, CheckCircle2, MessageCircleQuestion, Sparkles } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"

/** A product-accurate preview of VibeDigest's Brief → key points → follow-up flow. */
export function DigestPreview() {
    const { locale, t } = useI18n()

    return (
        <section
            aria-labelledby="digest-preview-title"
            className="relative mx-auto w-full max-w-[34rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.6)] dark:border-white/10 dark:bg-zinc-950 dark:shadow-[0_28px_90px_-48px_rgba(0,0,0,0.95)]"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent" />

            <div className="relative aspect-[16/8.6] overflow-hidden border-b border-slate-100 bg-slate-900 dark:border-white/10">
                <Image
                    src="https://i.ytimg.com/vi_webp/zgNvts_2TUE/maxresdefault.webp"
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 540px"
                    className="object-cover opacity-80"
                    referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />
                <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    <span className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-sm">
                        {t("landing.previewKicker")}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-100 backdrop-blur-sm">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("landing.previewReady")}
                    </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-6 sm:pb-6">
                    <h2 id="digest-preview-title" className="max-w-md text-lg font-semibold tracking-tight text-white sm:text-xl">
                        {t("landing.previewTitle")}
                    </h2>
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
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                                {index + 1}
                            </span>
                            <p className="text-sm leading-5 text-slate-600 dark:text-zinc-400">{t(`landing.${key}`)}</p>
                        </div>
                    ))}
                </div>

                <div className="border-l-2 border-emerald-500/60 pl-3.5">
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
