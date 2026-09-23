"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Video } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { LANDING_DEMO } from "@/lib/landing-demo"

/** One featured episode pairs the original source with its prepared digest. */
export function DigestPreview() {
    const { locale, t } = useI18n()
    const [coverUnavailable, setCoverUnavailable] = useState(false)
    const hasSummary = LANDING_DEMO.summaryLocales.some((summaryLocale) => summaryLocale === locale)

    return (
        <section
            id="digest-preview-title"
            aria-labelledby="digest-preview-heading"
            className="w-full scroll-mt-8 overflow-hidden rounded-2xl border border-border-strong bg-surface-raised text-foreground shadow-[var(--shadow-soft)]"
        >
            <h2 id="digest-preview-heading" className="border-b border-border px-5 py-3 text-[11px] font-semibold md:px-7 md:text-xs">
                {t("landing.exampleDigest")}
            </h2>
            <div className="grid md:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)]">
                <div className="min-w-0 p-5 md:col-start-2 md:row-start-1 md:p-6 lg:px-8 lg:py-[30px]">
                    <section aria-labelledby="digest-preview-summary-title">
                        <h3 id="digest-preview-summary-title" className="text-xs font-semibold text-foreground-subtle">
                            {t("landing.outputSummary")}
                        </h3>
                        <p className="mb-[25px] mt-3 max-w-[490px] text-[22px] font-semibold leading-[1.35] tracking-[-.8px] md:text-[23px] lg:text-[26px]">
                            {t("landing.previewBrief")}
                        </p>
                    </section>
                    <section aria-labelledby="digest-preview-ideas-title">
                        <h3 id="digest-preview-ideas-title" className="text-xs font-semibold text-foreground-subtle">
                            {t("landing.outputKeyIdeas")}
                        </h3>
                        <ol className="mt-3.5 space-y-4">
                            {["previewPointOne", "previewPointTwo"].map((key, index) => (
                                <li key={key} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3">
                                    <span className="pt-0.5 text-[11px] font-semibold tabular-nums text-primary" aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <p className="text-[13px] leading-[1.7] text-foreground-soft">{t(`landing.${key}`)}</p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>
                <aside className="min-w-0 border-t border-border bg-surface-subtle p-5 md:col-start-1 md:row-start-1 md:border-r md:border-t-0 md:p-6 lg:p-[30px]" aria-label={t("landing.previewSourceLabel")}>
                    <a
                        href={LANDING_DEMO.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t("landing.previewSourceLabel")}: ${t("landing.previewTitle")}`}
                        className="group/source grid grid-cols-[100px_minmax(0,1fr)] items-start gap-x-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-surface-subtle md:block"
                    >
                        <div className="relative row-span-2 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-surface-tint">
                            {coverUnavailable ? (
                                <Video className="size-8 text-primary md:size-12" aria-hidden="true" />
                            ) : (
                                <Image
                                    src="/landing-openclaw.jpg"
                                    alt=""
                                    fill
                                    sizes="(min-width: 1144px) 383px, (min-width: 1024px) calc(41vw - 86px), (min-width: 768px) calc(41vw - 74px), 100px"
                                    className="object-cover"
                                    onError={() => setCoverUnavailable(true)}
                                />
                            )}
                        </div>
                        <div className="min-w-0 md:mt-[18px]">
                            <p className="text-[11px] text-foreground-subtle">Peter Steinberger · OpenClaw</p>
                            <h3 className="mt-1 text-sm font-semibold leading-[1.35] tracking-[-.45px] group-hover/source:text-primary md:mt-[7px] md:text-xl">
                                {t("landing.previewTitle")}
                            </h3>
                        </div>
                        <span className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-primary-strong md:mt-2.5">
                            {t("landing.watchOriginal")}<ArrowUpRight className="size-4" aria-hidden="true" />
                        </span>
                    </a>
                </aside>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-5 border-t border-border p-5 md:flex-row md:items-center md:justify-between md:gap-6 md:px-[30px] md:py-6 lg:gap-9">
                <dl className="max-w-[640px]">
                    <dt className="text-sm font-semibold">{t("landing.previewQuestion")}</dt>
                    <dd className="mt-1.5 text-[13px] leading-[1.7] text-foreground-soft">{t("landing.previewAnswer")}</dd>
                </dl>
                {hasSummary && (
                    <Button asChild variant="supa" className="h-11 w-full shrink-0 gap-4 rounded-lg px-5 text-xs md:w-auto motion-reduce:transition-none motion-reduce:active:scale-100">
                        <Link href={`/${locale}/chat?task=${LANDING_DEMO.id}`}>
                            <span>{t("landing.previewOpen")}</span>
                            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                        </Link>
                    </Button>
                )}
            </div>
        </section>
    )
}
