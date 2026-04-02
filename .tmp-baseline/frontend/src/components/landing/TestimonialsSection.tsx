"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Quote } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export function TestimonialsSection() {
    const { t } = useI18n()

    const testimonials = [
        {
            quote: t("landing.testimonial1"),
            author: t("landing.testimonial1Author"),
            role: t("landing.testimonial1Role"),
            initial: "S",
            color: "from-purple-500 to-indigo-500"
        },
        {
            quote: t("landing.testimonial2"),
            author: t("landing.testimonial2Author"),
            role: t("landing.testimonial2Role"),
            initial: "M",
            color: "from-orange-400 to-red-500"
        },
        {
            quote: t("landing.testimonial3"),
            author: t("landing.testimonial3Author"),
            role: t("landing.testimonial3Role"),
            initial: "A",
            color: "from-blue-400 to-cyan-500"
        }
    ]

    return (
        <section className="py-20 px-6 relative mb-10">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <Heading as="h2" className="text-2xl md:text-3xl font-bold mb-5 font-display text-slate-900 dark:text-white">
                            {t("landing.lovedByResearchers")}
                        </Heading>
                        <Text className="text-slate-600 dark:text-zinc-400 text-base font-light">
                            {t("landing.lovedByResearchersSubtitle")}
                        </Text>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {testimonials.map((item, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={cn(
                                "backdrop-blur-md border rounded-2xl p-6 relative group transition-colors",
                                // Light mode
                                "bg-white/60 border-slate-200 hover:bg-white/80 shadow-lg",
                                // Dark mode
                                "dark:bg-zinc-900/40 dark:border-white/5 dark:hover:bg-zinc-900/60 dark:shadow-none"
                            )}
                        >
                            <Quote className="text-slate-200 dark:text-white/5 w-16 h-16 absolute top-3 right-3 rotate-180 group-hover:text-slate-300 dark:group-hover:text-white/10 transition-colors" />

                            <div className="flex items-center gap-3 mb-6 relative z-10">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                                    {item.initial}
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-slate-900 dark:text-white font-display">{item.author}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase tracking-wider font-semibold">{item.role}</div>
                                </div>
                            </div>

                            <p className="text-slate-700 dark:text-zinc-300 text-sm leading-relaxed relative z-10 font-medium italic">
                                &ldquo;{item.quote}&rdquo;
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
