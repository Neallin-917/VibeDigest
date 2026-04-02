"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Menu } from "lucide-react"
import { LandingUserButton } from "@/components/auth/LandingUserButton"
import { BrandLogo } from "@/components/layout/BrandLogo"
import { LanguageInlineSelect } from "@/components/i18n/LanguageInlineSelect"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { ThemeToggle } from "@/components/ui/theme-toggle"

type NavItem = {
    id: string
    key: string
    href?: string
}

const navItems: NavItem[] = [
    { id: "hero", key: "product" },
    { id: "demos", key: "demos" },
    { id: "features", key: "features" },
    { id: "how-it-works", key: "howItWorks" },
    { id: "pricing", key: "pricing" },
    { id: "faq", key: "faq", href: "/faq" },
]

export function LandingNav() {
    const { locale, t } = useI18n()
    const [activeSection] = useState<string>("hero")
    const [isScrolled, setIsScrolled] = useState(false)

    // Labels for navigation items
    const labels: Record<string, string> = {
        product: t("landing.navProduct"),
        demos: t("landing.navDemos"),
        features: t("landing.navFeatures"),
        howItWorks: t("landing.navHowItWorks"),
        pricing: t("landing.navPricing"),
        faq: t("landing.navFAQ"),
    }

    // Simplified check for "scrolled past hero"
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50)
            // simplified active section logic could go here if needed, or rely on intersection observes
            // For now, removing complex JS scroll spying can be acceptable or replaced with a lighter version
            // But the critical part is removing the manual scrollToSection calculation
        }
        window.addEventListener("scroll", handleScroll, { passive: true })
        handleScroll()
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    return (
        <nav className="fixed top-6 left-0 right-0 z-50 px-6 h-14 flex items-center pointer-events-none">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between pointer-events-auto">
                {/* Left: Brand Logo */}
                <Link
                    href={`/${locale}/#hero`}
                    className="flex-shrink-0 cursor-pointer transition-opacity hover:opacity-80"
                >
                    <BrandLogo textClassName="text-lg tracking-tight" />
                </Link>

                {/* Center: Navigation Capsule */}
                <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
                    <div className={cn(
                        "flex items-center gap-1 px-1.5 py-1.5 rounded-full backdrop-blur-xl transition-all duration-300",
                        // Light mode
                        "bg-white/70 shadow-lg ring-1 ring-white/60",
                        // Dark mode
                        "dark:bg-zinc-900/40 dark:ring-white/5 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_4px_20px_-2px_rgba(0,0,0,0.2)]",
                        // Scrolled state
                        isScrolled && "bg-white/90 shadow-xl ring-slate-200/50 dark:bg-zinc-900/80 dark:shadow-lg dark:ring-white/10"
                    )}>
                        {navItems.slice(1).map((item) => (
                            item.href ? (
                                <Link
                                    key={item.id}
                                    href={`/${locale}${item.href}`}
                                    className={cn(
                                        "px-4 py-2 rounded-full text-[13px] font-medium tracking-wide transition-all duration-300",
                                        "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                                        "dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
                                    )}
                                >
                                    {labels[item.key]}
                                </Link>
                            ) : (
                                <Link
                                    key={item.id}
                                    href={`/${locale}/#${item.id}`}
                                    className={cn(
                                        "relative px-4 py-2 rounded-full text-[13px] font-medium tracking-wide transition-colors duration-200",
                                        activeSection === item.id
                                            ? "text-emerald-800 font-semibold dark:text-white"
                                            : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                                    )}
                                >
                                    {activeSection === item.id && (
                                        <motion.div
                                            layoutId="nav-pill"
                                            className="absolute inset-0 bg-emerald-50/80 dark:bg-white/10 rounded-full -z-10"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                    {labels[item.key]}
                                </Link>
                            )

                        ))}
                    </div>
                </div>

                {/* Right: Actions & Mobile Menu */}
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-3">
                        <LanguageInlineSelect />
                        <ThemeToggle className="h-9 w-9 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10" />
                        <div className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-1" />
                        <LandingUserButton />
                    </div>

                    {/* Mobile Menu Trigger */}
                    <div className="md:hidden flex items-center gap-2">
                        <LandingUserButton />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="p-2 -mr-2 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10 transition-colors">
                                    <Menu className="w-5 h-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-white/90 dark:bg-black/90 border-slate-200 dark:border-white/10 backdrop-blur-xl">
                                <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                                            {t("landing.language")}
                                        </span>
                                    </div>
                                    <LanguageInlineSelect className="w-full" />
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                                            {t("landing.theme")}
                                        </span>
                                        <ThemeToggle className="h-8 w-8 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10" />
                                    </div>
                                </div>
                                <DropdownMenuItem asChild>
                                    <Link href="/chat" className="cursor-pointer text-slate-700 dark:text-white/70 w-full">
                                        {t("auth.goToDashboard")}
                                    </Link>
                                </DropdownMenuItem>
                                {navItems.slice(1).map((item) => (
                                    item.href ? (
                                        <DropdownMenuItem
                                            key={item.id}
                                            asChild
                                        >
                                            <Link href={`/${locale}${item.href}`} className="cursor-pointer text-slate-700 dark:text-white/70 w-full">
                                                {labels[item.key]}
                                            </Link>
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem
                                            key={item.id}
                                            asChild
                                        >
                                            <Link
                                                href={`/${locale}/#${item.id}`}
                                                className={`cursor-pointer w-full ${activeSection === item.id ? "text-emerald-700 dark:text-primary" : "text-slate-700 dark:text-white/70"}`}
                                            >
                                                {labels[item.key]}
                                            </Link>
                                        </DropdownMenuItem>
                                    )
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </nav>
    )
}
