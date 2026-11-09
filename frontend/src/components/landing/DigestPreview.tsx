"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, Video } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { LANDING_DEMO } from "@/lib/landing-demo"

/** Keep the source, complete digest and follow-up together in one reading surface. */
export function DigestPreview() {
    const { locale, t } = useI18n()
    const [coverUnavailable, setCoverUnavailable] = useState(false)
    const hasSummary = LANDING_DEMO.summaryLocales.some((summaryLocale) => summaryLocale === locale)

    return (
        <section id="digest-preview-title" aria-labelledby="digest-preview-heading"
            className="landing-digest w-full scroll-mt-8 overflow-hidden rounded-[20px] border border-border bg-surface text-foreground">
            <h2 id="digest-preview-heading" className="sr-only">{t("landing.exampleDigest")}</h2>
            <div className="grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                <aside aria-label={t("landing.previewSourceLabel")} className="border-b border-border bg-surface-tint p-5 md:border-b-0 md:border-r md:p-8">
                    <a href={LANDING_DEMO.video_url} target="_blank" rel="noopener noreferrer"
                        aria-label={`${t("landing.previewSourceLabel")}: ${t("landing.previewTitle")}`}
                        className="group/source grid grid-cols-[100px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary md:block">
                        <div className="relative row-span-2 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-surface-subtle max-md:aspect-square">
                            {coverUnavailable ? <Video className="size-8 text-primary" aria-hidden="true" /> : (
                                <Image src="/landing-openclaw.jpg" alt="" fill sizes="(min-width: 768px) 236px, 100px"
                                    className="object-cover" onError={() => setCoverUnavailable(true)} />
                            )}
                        </div>
                        <div className="min-w-0 md:mt-6">
                            <p className="text-[11px] leading-relaxed text-foreground-subtle">AI Engineer · Peter Steinberger</p>
                            <h3 className="mt-3 text-sm font-semibold leading-snug tracking-[-.4px] group-hover/source:text-primary md:text-xl">{t("landing.previewTitle")}</h3>
                        </div>
                        <span className="col-start-2 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary-strong md:mt-5">
                            {t("landing.watchOriginal")}<ArrowUpRight className="size-3.5" aria-hidden="true" />
                        </span>
                    </a>
                </aside>
                <div className="min-w-0 p-6 md:p-10">
                    <section aria-labelledby="digest-preview-summary-title">
                        <h3 id="digest-preview-summary-title" className="text-xs font-medium text-primary-strong">{t("landing.outputSummary")}</h3>
                        <p className="mt-6 max-w-[660px] text-[26px] font-semibold leading-[1.35] tracking-[-.8px] md:text-[36px]">{t("landing.previewBrief")}</p>
                    </section>
                    <section aria-labelledby="digest-preview-ideas-title" className="mt-7 border-t border-border pt-5 md:mt-8">
                        <h3 id="digest-preview-ideas-title" className="text-xs font-medium text-primary-strong">{t("landing.outputKeyIdeas")}</h3>
                        <ol className="mt-4 space-y-4">
                            {["previewPointOne", "previewPointTwo"].map((key, index) => (
                                <li key={key} className="grid grid-cols-[20px_1fr] gap-3 text-sm leading-[1.75] text-foreground-soft">
                                    <span aria-hidden="true" className="pt-0.5 text-[10px] text-foreground-subtle">0{index + 1}</span>
                                    <span>{t(`landing.${key}`)}</span>
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-5 border-t border-border px-6 py-6 md:flex-row md:items-center md:justify-between md:gap-8 md:px-8">
                <dl className="max-w-[720px]">
                    <dt className="text-sm font-semibold">{t("landing.previewQuestion")}</dt>
                    <dd className="mt-2 text-sm leading-[1.75] text-foreground-soft">{t("landing.previewAnswer")}</dd>
                </dl>
                {hasSummary && (
                    <Button asChild variant="outline" className="h-11 w-full shrink-0 gap-4 rounded-lg border-primary/40 bg-transparent px-5 text-xs text-primary-strong shadow-none md:w-auto motion-reduce:transition-none motion-reduce:active:scale-100">
                        <Link href={`/${locale}/chat?task=${LANDING_DEMO.id}`}>
                            <span>{t("landing.previewOpen")}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
                        </Link>
                    </Button>
                )}
            </div>
        </section>
    )
}
