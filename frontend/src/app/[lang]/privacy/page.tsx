import type { Metadata } from "next"

import { LandingNav } from "@/components/landing/LandingNav"
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

type Props = {
    params: Promise<{ lang: string }>
}

function resolveLocale(lang: string): Locale {
    return isLocale(lang) ? lang : DEFAULT_LOCALE
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params
    const locale = resolveLocale(lang)
    const t = createTranslator(locale)
    const title = t("privacy.metadata.title")
    const description = t("privacy.metadata.description")
    const path = "/privacy"

    return {
        title,
        description,
        alternates: {
            canonical: buildLocalizedPath(locale, path),
            languages: buildAlternateLanguages(path),
        },
        openGraph: {
            title,
            description,
            url: buildLocalizedPath(locale, path),
        },
        twitter: { title, description },
    }
}

export default async function PrivacyPage({ params }: Props) {
    const { lang } = await params
    const locale = resolveLocale(lang)
    const t = createTranslator(locale)
    const collectionItems = [
        t("privacy.collection.email"),
        t("privacy.collection.name"),
        t("privacy.collection.avatar"),
    ]
    const useItems = [
        t("privacy.use.service"),
        t("privacy.use.authentication"),
        t("privacy.use.notices"),
    ]
    return (
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:bg-[#0A0A0A]">
            <div className="landing-blobs pointer-events-none dark:hidden">
                <div className="blob blob-1" />
                <div className="blob blob-2" />
                <div className="blob blob-3" />
            </div>

            <div className="hidden dark:block absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-3xl" />
            </div>

            <LandingNav />

            <main className="relative z-10 pt-32 pb-16 px-6 md:px-16">
                <div className="max-w-3xl mx-auto space-y-8">
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/60">
                        {t("privacy.title")}
                    </h1>

                    <section className="space-y-4">
                        <p className="text-slate-500 dark:text-muted-foreground">
                            {t("policies.common.lastUpdated")}
                        </p>
                        <p className="text-slate-700 dark:text-[#EDEDED]">{t("privacy.introduction")}</p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">{t("privacy.collection.title")}</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">{t("privacy.collection.description")}</p>
                        <ul className="list-disc pl-6 text-slate-500 dark:text-muted-foreground space-y-2">
                            {collectionItems.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">{t("privacy.use.title")}</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">{t("privacy.use.description")}</p>
                        <ul className="list-disc pl-6 text-slate-500 dark:text-muted-foreground space-y-2">
                            {useItems.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">{t("privacy.security.title")}</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">{t("privacy.security.description")}</p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">{t("privacy.contact.title")}</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">{t("privacy.contact.description")}</p>
                    </section>
                </div>
            </main>
        </div>
    )
}
