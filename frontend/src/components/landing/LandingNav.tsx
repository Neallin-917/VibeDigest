"use client"

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
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { useEffect, useState } from "react"

type NavItem = {
    id: string
    key: string
    href?: string
}

const navItems: NavItem[] = [
    { id: "hero", key: "product" },
    { id: "library", key: "demos", href: "/explore" },
    { id: "features", key: "features" },
    { id: "how-it-works", key: "howItWorks" },
    { id: "pricing", key: "pricing" },
    { id: "faq", key: "faq", href: "/faq" },
]

const desktopNavLinkClass =
    "relative px-3 py-2 text-[13px] font-medium tracking-[0.01em] transition-colors duration-200 ease-out " +
    "text-slate-600 hover:text-slate-950 focus-visible:text-slate-950 focus-visible:outline-none " +
    "dark:text-zinc-400 dark:hover:text-white dark:focus-visible:text-white " +
    "after:absolute after:bottom-1 after:left-3 after:right-3 after:h-px after:origin-left after:scale-x-0 " +
    "after:bg-current after:opacity-70 after:transition-transform after:duration-200 after:ease-out " +
    "hover:after:scale-x-100 focus-visible:after:scale-x-100"

export function LandingNav() {
    const { locale, t } = useI18n()
    const pathname = usePathname()
    const [isScrolled, setIsScrolled] = useState(false)

    useEffect(() => {
        const updateScrolledState = () => setIsScrolled(window.scrollY > 24)
        updateScrolledState()
        window.addEventListener("scroll", updateScrolledState, { passive: true })
        return () => window.removeEventListener("scroll", updateScrolledState)
    }, [])

    // Labels for navigation items
    const labels: Record<string, string> = {
        product: t("landing.navProduct"),
        demos: t("landing.navDemos"),
        features: t("landing.navFeatures"),
        howItWorks: t("landing.navHowItWorks"),
        pricing: t("landing.navPricing"),
        faq: t("landing.navFAQ"),
    }
    const hrefForItem = (item: NavItem) => item.href
        ? `/${locale}${item.href}`
        : `/${locale}/#${item.id}`
    const isCurrentItem = (item: NavItem) => Boolean(item.href && pathname === `/${locale}${item.href}`)

    return (
        <nav aria-label={t("nav.menu")} className="pointer-events-none fixed left-0 right-0 top-4 z-50 flex h-14 items-center px-6">
            <div
                data-scrolled={isScrolled}
                className={cn(
                    "pointer-events-auto mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between transition-[background-color,border-color,box-shadow] duration-200",
                    isScrolled && "rounded-2xl border border-slate-200/80 bg-white/90 px-3 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90 dark:shadow-black/25"
                )}
            >
                {/* Left: Brand Logo */}
                <Link
                    href={`/${locale}/#hero`}
                    className="inline-flex min-h-11 flex-shrink-0 cursor-pointer items-center transition-opacity hover:opacity-80"
                >
                    <BrandLogo textClassName="text-lg tracking-tight" />
                </Link>

                {/* Center: Navigation Capsule */}
                <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
                    <div className={cn(
                        "flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm",
                        "dark:border-white/10 dark:bg-zinc-900"
                    )}>
                        {navItems.slice(1).map((item) => {
                            const isCurrent = isCurrentItem(item)
                            return (
                                <Link
                                    key={item.id}
                                    href={hrefForItem(item)}
                                    aria-current={isCurrent ? "page" : undefined}
                                    className={cn(
                                        desktopNavLinkClass,
                                        isCurrent && "text-slate-950 after:scale-x-100 dark:text-white"
                                    )}
                                >
                                    {labels[item.key]}
                                </Link>
                            )
                        })}
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
                                <button
                                    type="button"
                                    aria-label={t("nav.menu")}
                                    className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                                >
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
                                    <Link href={`/${locale}/chat`} className="cursor-pointer text-slate-700 dark:text-white/70 w-full">
                                        {t("auth.goToDashboard")}
                                    </Link>
                                </DropdownMenuItem>
                                {navItems.slice(1).map((item) => {
                                    const isCurrent = isCurrentItem(item)
                                    return (
                                        <DropdownMenuItem key={item.id} asChild>
                                            <Link
                                                href={hrefForItem(item)}
                                                aria-current={isCurrent ? "page" : undefined}
                                                className={cn(
                                                    "w-full cursor-pointer text-slate-700 dark:text-white/70",
                                                    isCurrent && "font-semibold text-slate-950 dark:text-white"
                                                )}
                                            >
                                                {labels[item.key]}
                                            </Link>
                                        </DropdownMenuItem>
                                    )
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </nav>
    )
}
