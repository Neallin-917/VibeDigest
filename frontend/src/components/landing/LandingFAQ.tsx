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
        <section id="landing-faq" aria-labelledby="landing-faq-title" className="px-6 py-20 scroll-mt-24">
            <div className="mx-auto max-w-3xl">
                <Heading
                    id="landing-faq-title"
                    as="h2"
                    className="font-display text-2xl font-bold text-slate-900 md:text-4xl dark:text-white"
                >
                    {t("landing.faqTitle")}
                </Heading>
                <Text className="mt-4 max-w-2xl text-base text-slate-600 dark:text-zinc-400">
                    {t("landing.faqSubtitle")}
                </Text>

                <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">
                    {questionKeys.map((questionKey, index) => (
                        <details key={questionKey} className="group py-4">
                            <summary className="cursor-pointer list-none pr-8 text-sm font-semibold text-slate-900 outline-none transition-colors hover:text-emerald-800 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 dark:text-white dark:hover:text-emerald-300 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-zinc-950">
                                <span className="group-open:hidden" aria-hidden="true">+</span>
                                <span className="hidden group-open:inline" aria-hidden="true">-</span>
                                <span className="ml-3">{t(questionKey)}</span>
                            </summary>
                            <Text className="max-w-2xl pt-3 pl-7 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                                {t(answerKeys[index])}
                            </Text>
                        </details>
                    ))}
                </div>

                <Link
                    href={`/${locale}/faq`}
                    className="mt-6 inline-flex text-sm font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 transition-colors hover:text-emerald-950 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 dark:text-emerald-300 dark:decoration-emerald-700 dark:hover:text-emerald-100 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-zinc-950"
                >
                    {t("landing.faqLink")}
                </Link>
            </div>
        </section>
    )
}
