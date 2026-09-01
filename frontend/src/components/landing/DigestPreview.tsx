"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"

/** A compact, faithful excerpt of the task-detail reading experience. */
export function DigestPreview() {
    const { locale, t } = useI18n()

    return (
        <section
            aria-labelledby="digest-preview-title"
            className="w-full overflow-hidden rounded-[18px] border border-border bg-surface-raised text-foreground shadow-[0_28px_80px_-58px_rgba(45,67,51,0.28)]"
        >
            <header className="border-b border-border/70 px-5 py-6 sm:px-8 sm:py-8">
                <h2
                    id="digest-preview-title"
                    className="max-w-3xl text-[clamp(1.5rem,3.1vw,2.25rem)] font-semibold leading-[1.12] tracking-[-0.035em] text-foreground"
                >
                    {t("landing.previewTitle")}
                </h2>
            </header>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="min-w-0 space-y-7 px-5 py-7 sm:px-8 sm:py-8 lg:border-r lg:border-border/70">
                    <section className="space-y-3" aria-labelledby="digest-preview-summary-title">
                        <h3 id="digest-preview-summary-title" className="text-base font-semibold text-foreground">
                            {t("landing.outputSummary")}
                        </h3>
                        <p className="max-w-[46rem] text-[15px] font-medium leading-7 text-foreground-soft sm:text-base">
                            {t("landing.previewBrief")}
                        </p>
                    </section>

                    <section
                        className="rounded-[14px] border border-border/80 bg-background p-4 sm:p-5"
                        aria-labelledby="digest-preview-follow-up-title"
                    >
                        <h3 id="digest-preview-follow-up-title" className="text-sm font-semibold text-foreground">
                            {t("landing.outputFollowUp")}
                        </h3>
                        <dl className="mt-4 space-y-2">
                            <dt className="text-sm font-medium leading-6 text-foreground">
                                {t("landing.previewQuestion")}
                            </dt>
                            <dd className="text-sm leading-6 text-muted-foreground">
                                {t("landing.previewAnswer")}
                            </dd>
                        </dl>
                    </section>

                    <section className="border-t border-border/70 pt-6" aria-labelledby="digest-preview-ideas-title">
                        <h3 id="digest-preview-ideas-title" className="text-base font-semibold text-foreground">
                            {t("landing.outputKeyIdeas")}
                        </h3>
                        <ol className="mt-5 space-y-5">
                            {["previewPointOne", "previewPointTwo"].map((key, index) => (
                                <li key={key} className="grid max-w-[46rem] grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                                    <span className="pt-0.5 text-xs font-medium tabular-nums text-primary" aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <p className="text-sm leading-6 text-foreground-soft">
                                        {t(`landing.${key}`)}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>

                <aside
                    className="border-t border-border/70 px-5 py-6 sm:px-8 lg:border-t-0 lg:px-6 lg:py-8"
                    aria-label={t("landing.previewSourceLabel")}
                >
                    <p className="text-xs text-muted-foreground">
                        {t("landing.previewSourceLabel")}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-foreground">
                        {t("landing.previewSourceName")}
                    </p>
                </aside>
            </div>

            <Link
                href={`/${locale}/explore`}
                className="group flex min-h-12 items-center justify-between border-t border-border/70 px-5 text-[12px] font-semibold text-primary transition-colors hover:bg-background hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-8"
            >
                <span>{t("landing.previewOpen")}</span>
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
            </Link>
        </section>
    )
}
