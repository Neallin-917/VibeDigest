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

type NavItem = {
    id: string
    key: string
    href?: string
}

const navItems: NavItem[] = [
    { id: "hero", key: "product" },
    { id: "library", key: "demos", href: "/explore" },
    { id: "features", key: "features" },
    { id: "pricing", key: "pricing" },
    { id: "faq", key: "faq", href: "/faq" },
]

const desktopNavLinkClass =
    "relative px-3 py-2 text-[13px] font-medium tracking-[0.01em] transition-colors duration-200 ease-out " +
    "text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none " +
    "after:absolute after:bottom-1 after:left-3 after:right-3 after:h-px after:origin-left after:scale-x-0 " +
    "after:bg-current after:opacity-70 after:transition-transform after:duration-200 after:ease-out " +
    "hover:after:scale-x-100 focus-visible:after:scale-x-100"

type LandingNavProps = {
    variant?: "default" | "content"
    shell?: "marketing" | "library"
}

export function LandingNav({ variant = "default", shell = "marketing" }: LandingNavProps) {
    const { locale, t } = useI18n()
    const pathname = usePathname()
    const isContentNav = variant === "content"
    const isLibraryShell = shell === "library"

    // Labels for navigation items
    const labels: Record<string, string> = {
        product: t("landing.navProduct"),
        demos: t("landing.navDemos"),
        features: t("landing.navFeatures"),
        pricing: t("landing.navPricing"),
        faq: t("landing.navFAQ"),
    }
    const hrefForItem = (item: NavItem) => item.href
        ? `/${locale}${item.href}`
        : `/${locale}/#${item.id}`
    const isCurrentItem = (item: NavItem) => Boolean(item.href && pathname === `/${locale}${item.href}`)

    return (
        <nav
            aria-label={t("nav.menu")}
            className={cn(
                "pointer-events-none fixed left-0 right-0 top-4 z-50 flex h-14 items-center",
                isLibraryShell ? "px-5 sm:px-8 lg:px-14" : "px-4 sm:px-6 lg:px-10 xl:px-6"
            )}
        >
            <div
                className={cn(
                    "pointer-events-auto mx-auto flex min-h-14 w-full items-center justify-between rounded-[15px] border border-border/90 bg-surface/90 px-3 backdrop-blur-xl",
                    isLibraryShell ? "max-w-[1440px]" : "max-w-[1080px]",
                    isContentNav ? "shadow-none" : "shadow-[0_12px_35px_-25px_rgba(27,33,28,0.5)]"
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
                {!isContentNav && (
                    <div data-slot="desktop-nav-links" className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
                        <div className="flex items-center gap-1">
                            {navItems.slice(1).map((item) => {
                                const isCurrent = isCurrentItem(item)
                                return (
                                    <Link
                                        key={item.id}
                                        href={hrefForItem(item)}
                                        aria-current={isCurrent ? "page" : undefined}
                                        className={cn(
                                            desktopNavLinkClass,
                                            isCurrent && "text-foreground after:scale-x-100"
                                        )}
                                    >
                                        {labels[item.key]}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Right: Actions & Mobile Menu */}
                <div className="flex items-center gap-3">
                    <div className="hidden items-center gap-3 lg:flex">
                        <LanguageInlineSelect />
                        <div className="mx-1 h-4 w-px bg-border" />
                        <LandingUserButton />
                    </div>

                    {/* Mobile Menu Trigger */}
                    <div className="flex items-center gap-2 lg:hidden">
                        <LandingUserButton />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={t("nav.menu")}
                                    className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <Menu className="w-5 h-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 border-border bg-surface/95 backdrop-blur-xl">
                                <div className="space-y-2 border-b border-border px-3 py-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
                                            {t("landing.language")}
                                        </span>
                                    </div>
                                    <LanguageInlineSelect className="w-full" />
                                </div>
                                <DropdownMenuItem asChild>
                                    <Link href={`/${locale}/chat`} className="w-full cursor-pointer text-foreground-soft">
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
                                                    "w-full cursor-pointer text-foreground-soft",
                                                    isCurrent && "font-semibold text-foreground"
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
