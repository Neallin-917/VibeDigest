"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { cn } from "@/lib/utils"

export function SupportCTA() {
    const { t } = useI18n()

    return (
        <section className="mx-auto mb-20 w-full max-w-[1080px] px-4 sm:px-6">
            <div
                className={cn(
                    "relative overflow-hidden rounded-[14px] border p-7 sm:p-9 md:p-11",
                    "border-border-strong bg-accent"
                )}
            >
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_100%_0%,rgba(70,108,80,0.13),transparent_55%)]" />

                <div className="relative z-10 grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="max-w-xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{t("landing.supportEyebrow")}</p>
                        <Heading as="h2" className="mt-4 text-[clamp(1.6rem,2.7vw,2rem)] font-semibold tracking-[-0.032em] text-foreground">
                            {t("landing.stillHaveQuestions")}
                        </Heading>

                        <Text className="mt-3 text-sm leading-7 text-muted-foreground">
                            {t("landing.stillHaveQuestionsDesc")}
                        </Text>
                    </div>

                    <div className="flex">
                        <FeedbackDialog defaultCategory="support">
                            <Button
                                variant="default"
                                className={cn(
                                    "min-h-11 gap-2 rounded-[9px] border border-primary-strong px-5 text-[13px] font-semibold transition-colors",
                                    "bg-primary-strong text-primary-foreground hover:bg-primary"
                                )}
                            >
                                <Mail className="w-3.5 h-3.5" />
                                {t("landing.contactSupport")}
                            </Button>
                        </FeedbackDialog>
                    </div>
                </div>
            </div>
        </section>
    )
}
