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

    return (
        <section
            id="digest-preview-title"
            aria-labelledby="digest-preview-heading"
            className="w-full scroll-mt-28 overflow-hidden rounded-3xl border border-primary/15 bg-surface-subtle text-foreground shadow-[0_24px_64px_-36px_rgba(45,67,51,0.25)]"
        >
            <div className="grid gap-6 p-5 sm:gap-8 sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-x-8 lg:p-8">
                <aside className="min-w-0 lg:pt-2" aria-label={t("landing.previewSourceLabel")}>
                    <a
                        href={LANDING_DEMO.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t("landing.previewSourceLabel")}: ${t("landing.previewTitle")}`}
                        className="group/source block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-surface-subtle"
                    >
                        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-surface-tint shadow-[0_16px_32px_-16px_rgba(27,33,28,0.45)]">
                            {coverUnavailable ? (
                                <Video className="size-12 text-primary" aria-hidden="true" />
                            ) : (
                                <Image
                                    src={LANDING_DEMO.thumbnail_url}
                                    alt=""
                                    fill
                                    // The verified 1280px source cover stays crisp at showcase scale.
                                    unoptimized
                                    className="object-cover"
                                    onError={() => setCoverUnavailable(true)}
                                />
                            )}
                        </div>
                        <div className="mt-5 flex items-start justify-between gap-4">
                            <h2
                                id="digest-preview-heading"
                                className="min-w-0 text-balance text-xl font-semibold leading-7 tracking-[-0.025em] group-hover/source:text-primary sm:text-2xl sm:leading-8"
                            >
                                {t("landing.previewTitle")}
                            </h2>
                            <ArrowUpRight className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        </div>
                    </a>
                </aside>

                <div className="min-w-0 rounded-2xl bg-surface-raised p-5 shadow-[0_10px_30px_-20px_rgba(27,33,28,0.25)] sm:p-7 lg:p-8">
                    <section aria-labelledby="digest-preview-summary-title">
                        <h3 id="digest-preview-summary-title" className="text-xs font-semibold text-primary">
                            {t("landing.outputSummary")}
                        </h3>
                        <p className="mt-4 text-balance text-[26px] font-semibold leading-[1.4] tracking-[-0.035em] text-primary-strong sm:text-[32px] lg:text-[34px]">
                            {t("landing.previewBrief")}
                        </p>
                    </section>

                    <section className="mt-7 border-t border-border/80 pt-5 sm:mt-8" aria-labelledby="digest-preview-ideas-title">
                        <h3 id="digest-preview-ideas-title" className="text-xs font-semibold text-muted-foreground">
                            {t("landing.outputKeyIdeas")}
                        </h3>
                        <ol className="mt-4 space-y-5">
                            {["previewPointOne", "previewPointTwo"].map((key, index) => (
                                <li key={key} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                                    <span className="pt-0.5 text-sm font-medium tabular-nums text-primary" aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <p className="text-sm leading-6 text-foreground-soft sm:text-[15px] sm:leading-7">
                                        {t(`landing.${key}`)}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>

                <div className="flex min-w-0 flex-col items-start gap-5 border-t border-primary/15 pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 lg:col-span-2">
                    <dl className="max-w-[44rem]">
                        <dt className="text-base font-semibold leading-7 text-foreground">
                            {t("landing.previewQuestion")}
                        </dt>
                        <dd className="mt-1.5 text-sm leading-6 text-foreground-soft sm:text-[15px] sm:leading-7">
                            {t("landing.previewAnswer")}
                        </dd>
                    </dl>
                    <Button asChild variant="supa" className="h-12 shrink-0 gap-3 px-6 text-sm motion-reduce:transition-none motion-reduce:active:scale-100">
                        <Link href={`/${locale}/chat?task=${LANDING_DEMO.id}`}>
                            <span>{t("landing.previewOpen")}</span>
                            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    )
}
