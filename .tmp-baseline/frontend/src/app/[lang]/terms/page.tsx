"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { LandingNav } from "@/components/landing/LandingNav"

export default function TermsOfService() {
    const { t } = useI18n()

    return (
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:bg-[#0A0A0A]">
            {/* Light mode background blobs */}
            <div className="landing-blobs pointer-events-none dark:hidden">
                <div className="blob blob-1" />
                <div className="blob blob-2" />
                <div className="blob blob-3" />
            </div>
            
            {/* Dark mode background gradient */}
            <div className="hidden dark:block absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-3xl" />
            </div>

            {/* Navigation */}
            <LandingNav />

            {/* Content */}
            <div className="relative z-10 pt-32 pb-16 px-6 md:px-16">
                <div className="max-w-3xl mx-auto space-y-8">
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/60">
                        {t("policies.terms.title")}
                    </h1>

                    <p className="text-slate-500 dark:text-muted-foreground">
                        {t("policies.common.lastUpdated")}
                    </p>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">
                            {t("policies.terms.service.title")}
                        </h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            {t("policies.terms.service.content")}
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">
                            {t("policies.terms.payments.title")}
                        </h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            {t("policies.terms.payments.content")}
                        </p>
                        <ul className="list-disc pl-6 text-slate-500 dark:text-muted-foreground space-y-2">
                            <li>{t("policies.terms.payments.list.l1")}</li>
                            <li>{t("policies.terms.payments.list.l2")}</li>
                            <li>{t("policies.terms.payments.list.l3")}</li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">
                            {t("policies.terms.responsibilities.title")}
                        </h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            {t("policies.terms.responsibilities.content")}
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">
                            {t("policies.common.contactTitle")}
                        </h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            {t("policies.common.contactText")}
                            <a href="mailto:support@vibedigest.com" className="text-indigo-600 dark:text-blue-500 hover:underline ml-1">support@vibedigest.com</a>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
