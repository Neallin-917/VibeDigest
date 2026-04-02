"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export function SupportCTA() {
    const { t } = useI18n()

    return (
        <section className="max-w-4xl mx-auto px-6 mb-20">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className={cn(
                    "backdrop-blur-xl border rounded-2xl p-10 md:p-16 text-center relative overflow-hidden group",
                    // Light mode
                    "bg-white/70 border-slate-200 shadow-2xl",
                    // Dark mode
                    "dark:bg-zinc-900/60 dark:border-white/10 dark:shadow-none"
                )}
            >
                {/* Animated Glows */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 dark:bg-emerald-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/20 dark:group-hover:bg-emerald-500/20 transition-colors duration-700" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 dark:bg-indigo-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 group-hover:bg-purple-500/20 dark:group-hover:bg-indigo-500/20 transition-colors duration-700" />

                <div className="relative z-10 max-w-xl mx-auto">
                    <Heading as="h2" className="text-2xl md:text-3xl font-bold mb-4 font-display text-slate-900 dark:text-white">
                        {t("landing.stillHaveQuestions")}
                    </Heading>

                    <Text className="text-slate-600 dark:text-zinc-400 mb-8 text-base leading-relaxed">
                        {t("landing.stillHaveQuestionsDesc")}
                    </Text>

                    <div className="flex flex-col sm:flex-row justify-center gap-3">
                        <FeedbackDialog defaultCategory="support">
                            <Button
                                variant="default"
                                className={cn(
                                    "font-bold text-sm h-10 px-6 rounded-full transition-all hover:-translate-y-1 gap-2 border-0",
                                    // Light mode
                                    "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40",
                                    // Dark mode
                                    "dark:bg-white dark:text-black dark:hover:bg-zinc-200 dark:shadow-[0_0_20px_rgba(255,255,255,0.3)] dark:hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]"
                                )}
                            >
                                <Mail className="w-3.5 h-3.5" />
                                {t("landing.contactSupport")}
                            </Button>
                        </FeedbackDialog>
                    </div>
                </div>
            </motion.div>
        </section>
    )
}
