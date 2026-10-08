"use client"

import { ArrowUpRight } from "lucide-react"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { getLandingFaqItems } from "@/lib/billing/faq-content"

export function LandingFAQ() {
    const { t } = useI18n()
    const items = getLandingFaqItems(t)

    return (
        <section id="landing-faq" aria-labelledby="landing-faq-title" className="scroll-mt-6 px-5 pt-12 sm:px-6 md:pt-24 lg:px-10 xl:px-6">
            <div className="mx-auto grid max-w-[1080px] gap-6 md:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] md:gap-16">
                <div>
                    <Heading
                        id="landing-faq-title"
                        as="h2"
                        className="text-[25px] sm:text-[30px] font-semibold leading-tight tracking-[-0.038em] text-foreground"
                    >
                        {t("landing.faqTitle")}
                    </Heading>

                </div>

                <div>
                  <div className="divide-y divide-border border-y border-border">
                    {items.map((item) => (
                        <details key={item.question} className="group py-1">
                            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold text-foreground outline-none transition-colors hover:text-primary-strong focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
                                <span>{item.question}</span>
                                <span className="text-lg font-normal text-foreground-subtle transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
                            </summary>
                            <Text className="max-w-2xl pb-6 pr-10 text-sm leading-7 text-muted-foreground">
                                {item.answer}
                            </Text>
                        </details>
                    ))}
                  </div>
                  <FeedbackDialog defaultCategory="support">
                    <button type="button" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-strong hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-primary">
                      {t("landing.contactSupport")} <ArrowUpRight className="size-4" aria-hidden="true" />
                    </button>
                  </FeedbackDialog>
                </div>
            </div>
        </section>
    )
}
