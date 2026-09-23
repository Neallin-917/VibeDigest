"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Video } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { LANDING_DEMO } from "@/lib/landing-demo"

/** A source, its digest, and a follow-up in one reading surface. */
export function DigestPreview() {
    const { locale, t } = useI18n()
    const [coverUnavailable, setCoverUnavailable] = useState(false)
    const hasSummary = LANDING_DEMO.summaryLocales.some((summaryLocale) => summaryLocale === locale)

    return (
        <section id="digest-preview-title" aria-labelledby="digest-preview-heading"
            className="w-full scroll-mt-8 rounded-xl border border-border-strong bg-surface-raised px-5 text-foreground md:px-8">
            <h2 id="digest-preview-heading" className="sr-only">{t("landing.exampleDigest")}</h2>
            <aside aria-label={t("landing.previewSourceLabel")}>
            <a href={LANDING_DEMO.video_url} target="_blank" rel="noopener noreferrer"
                aria-label={`${t("landing.previewSourceLabel")}: ${t("landing.previewTitle")}`}
                className="group/source grid grid-cols-[100px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-lg py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary md:grid-cols-[176px_minmax(0,1fr)_auto] md:gap-6 md:py-6">
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-surface-tint">
                    {coverUnavailable ? <Video className="size-8 text-primary" aria-hidden="true" /> : (
                        <Image src="/landing-openclaw.jpg" alt="" fill sizes="(min-width: 768px) 176px, 100px"
                            className="object-cover" onError={() => setCoverUnavailable(true)} />
                    )}
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-snug tracking-[-.4px] group-hover/source:text-primary md:text-lg">{t("landing.previewTitle")}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground-subtle md:text-sm">AI Engineer · Peter Steinberger</p>
                </div>
                <span className="col-start-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-primary-strong underline underline-offset-4 md:col-start-auto md:text-sm">
                    {t("landing.watchOriginal")}<ArrowUpRight className="size-4" aria-hidden="true" />
                </span>
            </a>
            </aside>
            <div className="grid gap-6 border-t border-border py-6 md:grid-cols-[1.4fr_1fr] md:gap-14 md:py-7">
                <section aria-labelledby="digest-preview-summary-title">
                    <h3 id="digest-preview-summary-title" className="text-sm font-semibold text-primary-strong">{t("landing.outputSummary")}</h3>
                    <p className="mt-3 max-w-[530px] text-[23px] font-semibold leading-[1.35] tracking-[-.8px] md:text-[32px]">{t("landing.previewBrief")}</p>
                </section>
                <section aria-labelledby="digest-preview-ideas-title">
                    <h3 id="digest-preview-ideas-title" className="text-sm font-semibold text-primary-strong">{t("landing.outputKeyIdeas")}</h3>
                    <ul className="mt-3 list-disc space-y-3 pl-5 marker:text-primary">
                        {["previewPointOne", "previewPointTwo"].map((key) => (
                            <li key={key} className="pl-1 text-sm md:text-base leading-[1.65] text-foreground-soft">{t(`landing.${key}`)}</li>
                        ))}
                    </ul>
                </section>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-5 border-t border-border py-5 md:flex-row md:items-center md:justify-between md:gap-8 md:py-6">
                <dl className="max-w-[660px]">
                    <dt className="text-sm font-semibold">{t("landing.previewQuestion")}</dt>
                    <dd className="mt-1.5 text-sm leading-[1.65] text-foreground-soft">{t("landing.previewAnswer")}</dd>
                </dl>
                {hasSummary && (
                    <Button asChild variant="outline" className="h-11 w-full shrink-0 gap-3 rounded-lg border-primary/40 bg-transparent px-5 text-xs text-primary-strong shadow-none md:w-auto motion-reduce:transition-none motion-reduce:active:scale-100">
                        <Link href={`/${locale}/chat?task=${LANDING_DEMO.id}`}>
                            <span>{t("landing.previewOpen")}</span><ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                        </Link>
                    </Button>
                )}
            </div>
        </section>
    )
}
