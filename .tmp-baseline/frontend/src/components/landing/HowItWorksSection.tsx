"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Link2, Bot, FileText } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export function HowItWorksSection() {
    const { t } = useI18n()

    const steps = [
        {
            icon: Link2,
            title: t("landing.step1Title"),
            desc: t("landing.step1Desc"),
            step: 1
        },
        {
            icon: Bot,
            title: t("landing.step2Title"),
            desc: t("landing.step2Desc"),
            step: 2
        },
        {
            icon: FileText,
            title: t("landing.step3Title"),
            desc: t("landing.step3Desc"),
            step: 3
        }
    ]

    return (
        <section id="how-it-works" className="py-20 px-6 relative overflow-hidden scroll-mt-24">
            {/* Background elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/5 dark:bg-emerald-900/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-10">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <Heading as="h2" className="text-2xl md:text-4xl font-display font-bold mb-5 text-slate-900 dark:text-white">
                            {t("landing.howItWorks")}
                        </Heading>
                        <Text className="text-slate-600 dark:text-zinc-400 text-base max-w-xl mx-auto">
                            {t("landing.howItWorksSubtitle")}
                        </Text>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-[2rem] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-zinc-800 to-transparent z-0" />

                    {steps.map((step, index) => (
                        <motion.div
                            key={index}
                            className="flex flex-col items-center text-center group relative z-10"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.2 }}
                        >
                            <div className={cn(
                                "w-16 h-16 rounded-xl backdrop-blur-xl border flex items-center justify-center mb-6 relative transition-all duration-500",
                                // Light mode
                                "bg-white/80 border-slate-200 shadow-lg group-hover:border-emerald-200 group-hover:shadow-emerald-500/5",
                                // Dark mode
                                "dark:bg-zinc-900/80 dark:border-white/10 dark:shadow-none dark:group-hover:border-emerald-500/50 dark:group-hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)]"
                            )}>
                                <div className={cn(
                                    "absolute -top-2 -right-2 w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs shadow-lg",
                                    "bg-emerald-700 text-white shadow-emerald-900/10",
                                    "dark:bg-emerald-500 dark:text-black dark:shadow-emerald-500/20"
                                )}>
                                    {step.step}
                                </div>
                                <step.icon className="w-6 h-6 text-emerald-700 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-500" />
                            </div>

                            <Heading as="h3" className="text-base font-bold mb-2 text-slate-800 dark:text-zinc-100 px-4">
                                {step.title}
                            </Heading>

                            <Text className="text-slate-600 dark:text-zinc-400 leading-relaxed max-w-xs text-sm">
                                {step.desc}
                            </Text>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
