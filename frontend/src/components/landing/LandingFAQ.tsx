"use client"

import Link from "next/link"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"

const questionKeys = [
    "landing.faqFreeQuestion",
    "landing.faqSignInQuestion",
    "landing.faqBillingQuestion",
] as const

const answerKeys = [
    "landing.faqFreeAnswer",
    "landing.faqSignInAnswer",
    "landing.faqBillingAnswer",
] as const

export function LandingFAQ() {
    const { locale, t } = useI18n()

    return (
        <section id="landing-faq" aria-labelledby="landing-faq-title" className="scroll-mt-24 px-4 py-16 sm:px-6 md:py-20 lg:px-10 lg:py-24 xl:px-6">
            <div className="mx-auto grid max-w-[1080px] gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(28rem,1.22fr)] lg:gap-20">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-strong">04 · {t("landing.navFAQ")}</p>
                    <Heading
                        id="landing-faq-title"
                        as="h2"
                        className="mt-5 text-[clamp(2rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.038em] text-foreground"
                    >
                        {t("landing.faqTitle")}
                    </Heading>
                    <Text className="mt-4 max-w-sm text-[15px] leading-7 text-muted-foreground">
                        {t("landing.faqSubtitle")}
                    </Text>
                    <Link
                        href={`/${locale}/faq`}
                        className="mt-7 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary-strong underline decoration-primary-muted/45 underline-offset-4 transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                    >
                        {t("landing.faqLink")}
                    </Link>
                </div>

                <div className="divide-y divide-border border-y border-border">
                    {questionKeys.map((questionKey, index) => (
                        <details key={questionKey} className="group py-1">
                            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold text-foreground outline-none transition-colors hover:text-primary-strong focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
                                <span>{t(questionKey)}</span>
                                <span className="text-lg font-normal text-foreground-subtle transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
                            </summary>
                            <Text className="max-w-2xl pb-6 pr-10 text-sm leading-7 text-muted-foreground">
                                {t(answerKeys[index])}
                            </Text>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    )
}
