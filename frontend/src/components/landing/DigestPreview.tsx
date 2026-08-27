"use client"

import Link from "next/link"
import { ArrowRight, CheckCircle2, MessageCircleQuestion } from "lucide-react"
import { useState } from "react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { cn } from "@/lib/utils"

type PreviewPanel = "brief" | "ideas" | "followUp"

/** Product preview: conclusion → key ideas → source-grounded follow-up. */
export function DigestPreview() {
    const { locale, t } = useI18n()
    const [activePanel, setActivePanel] = useState<PreviewPanel>("brief")

    const panels: { id: PreviewPanel; label: string }[] = [
        { id: "brief", label: t("landing.outputSummary") },
        { id: "ideas", label: t("landing.outputKeyIdeas") },
        { id: "followUp", label: t("landing.outputFollowUp") },
    ]

    return (
        <section
            aria-labelledby="digest-preview-title"
            className="relative w-full overflow-hidden rounded-[18px] border border-border-strong bg-surface-subtle text-foreground shadow-[0_32px_90px_-52px_rgba(45,67,51,0.34)]"
        >
            <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-primary-muted/35 bg-surface-tint" aria-hidden="true">
                        <span className="size-2 rounded-full bg-primary shadow-[0_0_12px_rgba(70,108,80,0.25)]" />
                    </span>
                    <span className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground-soft">
                        {t("landing.previewKicker")}
                    </span>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-primary">
                    <CheckCircle2 className="size-3.5" />
                    {t("landing.previewReady")}
                </span>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_17.5rem]">
                <div className="min-w-0 lg:border-r lg:border-border">
                    <div className="border-b border-border px-4 pt-6 sm:px-7 sm:pt-7">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-muted">
                            01 · {t("landing.previewSectionLabel")}
                        </p>
                        <h2 id="digest-preview-title" className="mt-3 max-w-2xl text-[clamp(1.35rem,2.6vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                            {t("landing.previewTitle")}
                        </h2>
                        <div className="mt-6 flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t("landing.previewKicker")}>
                            {panels.map((panel) => (
                                <button
                                    key={panel.id}
                                    id={`digest-tab-${panel.id}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={activePanel === panel.id}
                                    aria-controls={`digest-panel-${panel.id}`}
                                    onClick={() => setActivePanel(panel.id)}
                                    className={cn(
                                        "relative min-h-11 shrink-0 pb-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-subtle",
                                        activePanel === panel.id ? "text-foreground" : "text-foreground-subtle hover:text-foreground-soft"
                                    )}
                                >
                                    {panel.label}
                                    <span
                                        className={cn(
                                            "absolute inset-x-0 bottom-0 h-px origin-left bg-primary transition-transform duration-200",
                                            activePanel === panel.id ? "scale-x-100" : "scale-x-0"
                                        )}
                                        aria-hidden="true"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-[17.5rem] p-5 sm:p-7">
                        <div
                            id="digest-panel-brief"
                            role="tabpanel"
                            aria-labelledby="digest-tab-brief"
                            hidden={activePanel !== "brief"}
                            className="max-w-2xl"
                        >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">{t("landing.previewBriefLabel")}</p>
                            <p className="mt-4 text-[15px] leading-7 text-foreground-soft sm:text-base">{t("landing.previewBrief")}</p>
                            <p className="mt-6 border-l border-primary-muted pl-4 text-sm leading-6 text-muted-foreground">
                                {t("landing.previewAnswer")}
                            </p>
                        </div>

                        <div
                            id="digest-panel-ideas"
                            role="tabpanel"
                            aria-labelledby="digest-tab-ideas"
                            hidden={activePanel !== "ideas"}
                            className="space-y-5"
                        >
                            {["previewPointOne", "previewPointTwo"].map((key, index) => (
                                <div key={key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                                    <span className="text-[11px] font-semibold text-primary-muted">0{index + 1}</span>
                                    <p className="text-sm leading-6 text-foreground-soft">{t(`landing.${key}`)}</p>
                                </div>
                            ))}
                        </div>

                        <div
                            id="digest-panel-followUp"
                            role="tabpanel"
                            aria-labelledby="digest-tab-followUp"
                            hidden={activePanel !== "followUp"}
                            className="max-w-xl"
                        >
                            <div className="flex gap-3 rounded-[10px] border border-border bg-card/55 p-4">
                                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.8} />
                                <div>
                                    <p className="text-sm font-medium text-foreground">{t("landing.previewQuestion")}</p>
                                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("landing.previewAnswer")}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="relative hidden min-h-full overflow-hidden p-6 lg:block" aria-label={t("landing.previewSourceMap")}>
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_8%,rgba(70,108,80,0.12),transparent_36%)]" />
                    <p className="relative text-[10px] font-semibold uppercase tracking-[0.17em] text-foreground-subtle">{t("landing.previewSourceMap")}</p>
                    <svg className="relative mt-6 h-28 w-full" viewBox="0 0 220 112" fill="none" aria-hidden="true">
                        <path d="M10 26C54 26 46 54 87 54C128 54 121 22 170 22C192 22 201 32 212 44" stroke="color-mix(in srgb, var(--primary) 56%, transparent)" strokeWidth="1.2" />
                        <path d="M10 84C50 84 57 62 92 62C130 62 138 88 212 88" stroke="color-mix(in srgb, var(--foreground-soft) 22%, transparent)" strokeWidth="1.2" />
                        <path d="M48 10C48 40 69 45 69 73C69 90 61 98 50 106" stroke="color-mix(in srgb, var(--foreground-soft) 14%, transparent)" strokeWidth="1" />
                        <circle cx="10" cy="26" r="3" fill="var(--primary)" />
                        <circle cx="87" cy="54" r="3" fill="var(--primary-muted)" />
                        <circle cx="170" cy="22" r="3" fill="color-mix(in srgb, var(--foreground-soft) 50%, transparent)" />
                        <circle cx="212" cy="88" r="3" fill="color-mix(in srgb, var(--foreground-soft) 35%, transparent)" />
                    </svg>
                    <ol className="relative mt-5 space-y-4">
                        {[t("landing.outputSummary"), t("landing.outputKeyIdeas"), t("landing.outputTranscript")].map((label, index) => (
                            <li key={label} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
                                <span className="text-primary-muted">0{index + 1}</span>
                                <span>{label}</span>
                            </li>
                        ))}
                    </ol>
                </aside>
            </div>

            <Link
                href={`/${locale}/explore`}
                className="group flex min-h-12 items-center justify-between border-t border-border px-5 text-[12px] font-medium text-foreground-soft transition-colors hover:bg-card/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-7"
            >
                <span>{t("landing.previewOpen")}</span>
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
        </section>
    )
}
