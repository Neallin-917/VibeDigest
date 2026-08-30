"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Quote } from "lucide-react"
import { motion } from "framer-motion"

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
                        <Heading as="h2" className="mb-5 font-display text-2xl font-bold text-slate-900 md:text-3xl">
                            {t("landing.lovedByResearchers")}
                        </Heading>
                        <Text className="text-base font-light text-slate-600">
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
                            className="group relative rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-lg backdrop-blur-md transition-colors hover:bg-white/80"
                        >
                            <Quote className="absolute right-3 top-3 h-16 w-16 rotate-180 text-slate-200 transition-colors group-hover:text-slate-300" />

                            <div className="flex items-center gap-3 mb-6 relative z-10">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                                    {item.initial}
                                </div>
                                <div>
                                    <div className="font-display text-sm font-bold text-slate-900">{item.author}</div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{item.role}</div>
                                </div>
                            </div>

                            <p className="relative z-10 text-sm font-medium italic leading-relaxed text-slate-700">
                                &ldquo;{item.quote}&rdquo;
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
