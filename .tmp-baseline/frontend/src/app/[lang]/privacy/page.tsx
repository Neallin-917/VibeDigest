"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { LandingNav } from "@/components/landing/LandingNav"

export default function PrivacyPage() {
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
                        Privacy Policy
                    </h1>

                    <section className="space-y-4">
                        <p className="text-slate-500 dark:text-muted-foreground">
                            Last updated: {new Date().toLocaleDateString()}
                        </p>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            This Privacy Policy describes how {t("brand.name")} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and discloses your personal information when you use our website and services.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">1. Information We Collect</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            We collect information you provide directly to us, such as when you create an account, specifically:
                        </p>
                        <ul className="list-disc pl-6 text-slate-500 dark:text-muted-foreground space-y-2">
                            <li>Email address</li>
                            <li>Name (if provided via Social Login)</li>
                            <li>Profile picture (if provided via Social Login)</li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">2. How We Use Your Information</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            We use the information we collect to:
                        </p>
                        <ul className="list-disc pl-6 text-slate-500 dark:text-muted-foreground space-y-2">
                            <li>Provide, maintain, and improve our services</li>
                            <li>Authenticate your identity</li>
                            <li>Send you technical notices and support messages</li>
                        </ul>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">3. Data Security</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            We implement reasonable security measures to protect your personal information. We use Supabase for authentication and data storage, which employs industry-standard security practices.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white">4. Contact Us</h2>
                        <p className="text-slate-700 dark:text-[#EDEDED]">
                            If you have any questions about this Privacy Policy, please contact us.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
