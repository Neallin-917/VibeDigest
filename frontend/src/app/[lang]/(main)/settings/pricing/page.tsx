"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, CirclePlus, Loader2, CreditCard, Database } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { ApiClient } from "@/lib/api"
import { cn } from "@/lib/utils"
import { UsageCard, type UsageProfile } from "@/components/settings/UsageCard"
import { Heading, Text } from "@/components/ui/typography"
import { PageContainer } from "@/components/layout/PageContainer"
import {
    FREE_ACCOUNT_PROFILE,
    useCurrentUserQuery,
    useProfileQuery,
} from "@/hooks/useAccountQueries"
import { getCustomerPlanDisplay } from "@/lib/billing/plan-catalog"
import { trackGrowthEvent } from "@/lib/growth-events"
type BillingAction = "pro" | "topup" | "portal"
type CheckoutBilling = "monthly" | "annual" | "one_time"

export default function PricingPage() {
    const { t, locale } = useI18n()
    const searchParams = useSearchParams()
    const [isAnnual, setIsAnnual] = useState(true)
    const [paymentMethod] = useState<'card' | 'crypto'>('card')  // Default to Creem (card)
    const [loadingAction, setLoadingAction] = useState<BillingAction | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [supabase] = useState(() => createClient())
    const {
        data: user,
        isLoading: userLoading,
        error: userError,
    } = useCurrentUserQuery()
    const {
        data: accountProfile,
        isLoading: accountProfileLoading,
        error: accountProfileError,
    } = useProfileQuery(user?.id)
    const profile = (user === null ? FREE_ACCOUNT_PROFILE : accountProfile ?? null) as UsageProfile | null
    const profileLoading = userLoading || Boolean(user && accountProfileLoading)
    const profileError = userError ?? accountProfileError

    const handleCheckout = async (
        planKey: string,
        action: Exclude<BillingAction, "portal">,
        billing: CheckoutBilling,
    ) => {
        setActionError(null)
        setLoadingAction(action)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                setActionError(t("pricing.authRequired"))
                return
            }

            let url = ""
            if (paymentMethod === 'crypto') {
                const res = await ApiClient.createCryptoCharge(planKey, session.access_token, locale)
                url = res.url
            } else {
                const res = await ApiClient.createCheckoutSession(planKey, session.access_token, locale)
                url = res.url
            }

            if (!url) throw new Error("Checkout URL is missing")
            trackGrowthEvent("pricing_checkout_redirect", {
                locale,
                product: action,
                billing,
            })
            window.location.assign(url)
        } catch (error) {
            console.error("Checkout failed:", error)
            setActionError(t("pricing.checkoutError"))
        } finally {
            setLoadingAction(null)
        }
    }

    const handlePortal = async () => {
        setActionError(null)
        setLoadingAction("portal")
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                setActionError(t("pricing.authRequired"))
                return
            }

            const { url, available } = await ApiClient.createCustomerPortal(session.access_token)
            if (!available) {
                setActionError(t("pricing.portalUnavailable"))
                return
            }
            if (!url) throw new Error("Customer portal URL is missing")
            window.location.assign(url)
        } catch (error) {
            console.error("Customer portal failed:", error)
            setActionError(t("pricing.portalError"))
        } finally {
            setLoadingAction(null)
        }
    }

    const profileKnown = !profileLoading && profile !== null
    const isPro = profileKnown && profile.tier === 'pro'
    const displayError = actionError ?? (profileError ? t("pricing.profileError") : null)
    const catalog = getCustomerPlanDisplay(t)
    const checkoutReturn = searchParams.get("success") === "true"
        ? "success"
        : searchParams.get("canceled") === "true"
            ? "canceled"
            : null

    return (
        <PageContainer>
            <div className="mx-auto w-full max-w-6xl space-y-8">
                {/* Header + Usage */}
                <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
                    <div className="text-center lg:col-span-7 lg:text-left">
                        <Heading as="h1" variant="h1">
                            {t("pricing.title")}
                        </Heading>
                    </div>

                    <div className="lg:col-span-5">
                        <UsageCard profile={profile} loading={profileLoading} className="w-full" />
                    </div>


                </section>

                {checkoutReturn && (
                    <p
                        role="status"
                        aria-live="polite"
                        className={cn(
                            "rounded-xl border px-4 py-3 text-sm",
                            checkoutReturn === "success"
                                ? "border-primary/30 bg-accent text-primary-strong"
                                : "border-border bg-muted/50 text-muted-foreground",
                        )}
                    >
                        {t(checkoutReturn === "success"
                            ? "pricing.checkoutSubmitted"
                            : "pricing.checkoutCanceled")}
                    </p>
                )}

                {/* Pricing Cards */}
                <section className="grid gap-6 auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
                    {/* FREE TIER */}
                    <Card
                        className={cn(
                            "relative flex h-full flex-col rounded-xl border-border bg-card shadow-none backdrop-blur-none",
                            !isPro && "border-primary/20 bg-primary/5"
                        )}
                    >
                        {profileKnown && !isPro && (
                            <div className="absolute top-0 right-0 p-4">
                                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                                    {t("pricing.currentPlan")}
                                </Badge>
                            </div>
                        )}
                        <CardHeader>
                            <CardTitle className="text-base">{catalog.basic.title}</CardTitle>
                            <CardDescription className="text-xs">{catalog.basic.description}</CardDescription>
                            <div className="mt-4">
                                <span className="text-2xl leading-none font-bold tabular-nums">{catalog.basic.priceLabel}</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ul className="space-y-2 text-xs leading-4">
                                {catalog.basic.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <Database className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs leading-4">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" variant="outline" disabled>
                                {isPro
                                    ? t("pricing.included")
                                    : profileKnown
                                        ? t("pricing.currentPlan")
                                        : t("pricing.loadingPlan")}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* PRO TIER */}
                    <Card
                        id="pro"
                        className={cn(
                            "relative flex h-full scroll-mt-24 flex-col rounded-xl border-primary/40 bg-accent/35 shadow-none backdrop-blur-none",
                            isPro && "ring-2 ring-primary"
                        )}
                    >
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <Badge className="border-0 bg-primary-strong px-3 py-1 text-xs text-primary-foreground hover:bg-primary-strong">
                                {t("landing.mostPopular")}
                            </Badge>
                        </div>
                        {isPro && (
                            <div className="absolute top-0 right-0 p-4">
                                <Badge className="bg-primary-strong text-primary-foreground">{t("pricing.active")}</Badge>
                            </div>
                        )}
                        <CardHeader className="relative pt-8">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Heading as="h3" variant="h3">
                                    {catalog.pro.title}
                                </Heading>
                                {!isPro && (
                                    <fieldset className="flex gap-1 rounded-lg border border-border bg-background p-1">
                                        <legend className="sr-only">{t("pricing.billingPeriod")}</legend>
                                        {([false, true] as const).map((annual) => (
                                            <label key={String(annual)} className="relative cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="billing-period"
                                                    value={annual ? "annual" : "monthly"}
                                                    checked={isAnnual === annual}
                                                    onChange={() => setIsAnnual(annual)}
                                                    className="peer sr-only"
                                                />
                                                <span className="flex min-h-11 items-center justify-center rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-primary-strong peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                                                    {t(annual ? "pricing.pro.annual" : "pricing.pro.monthly")}
                                                </span>
                                            </label>
                                        ))}
                                    </fieldset>
                                )}
                            </div>

                            {isPro ? (
                                <Text tone="muted" className="mt-2">
                                    {t("pricing.currentPlan")}
                                </Text>
                            ) : (
                                <>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        {isAnnual && (
                                            <Text
                                                as="span"
                                                variant="bodySm"
                                                tone="muted"
                                                weight="medium"
                                                className="line-through tabular-nums text-xs"
                                            >
                                                {catalog.pro.monthlyPriceLabel}
                                            </Text>
                                        )}
                                        <span className="text-2xl leading-none font-bold tabular-nums">
                                            {isAnnual ? catalog.pro.annualEffectiveMonthlyLabel : catalog.pro.monthlyPriceLabel}
                                        </span>
                                        <Text as="span" variant="caption" tone="muted">
                                            {t("pricing.pro.unit")}
                                        </Text>
                                    </div>
                                    {isAnnual && (
                                        <Text variant="caption" tone="muted" className="mt-1 text-xs leading-5">
                                            {catalog.pro.description}
                                        </Text>
                                    )}
                                </>
                            )}
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ul className="space-y-2 text-xs leading-4">
                                {catalog.pro.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <Check className="h-3 w-3 shrink-0 text-primary" />
                                        <span className="text-xs leading-4">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                        <CardFooter>
                            {isPro ? (
                                <Button
                                    className="w-full rounded-lg bg-primary-strong text-primary-foreground hover:bg-primary hover:scale-100 hover:shadow-none"
                                    size="lg"
                                    onClick={handlePortal}
                                    disabled={!profileKnown || loadingAction !== null}
                                >
                                    {loadingAction === "portal" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    {t("pricing.pro.manage")}
                                </Button>
                            ) : (
                                <Button
                                    className="w-full rounded-lg bg-primary-strong font-semibold text-primary-foreground hover:bg-primary hover:scale-100 hover:shadow-none"
                                    size="lg"
                                    onClick={() => handleCheckout(
                                        isAnnual
                                            ? catalog.pro.billingOptions.annual.planKey
                                            : catalog.pro.billingOptions.monthly.planKey,
                                        "pro",
                                        isAnnual ? "annual" : "monthly",
                                    )}
                                    disabled={loadingAction !== null}
                                >
                                    {loadingAction === "pro" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    {t("pricing.pro.button")}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    {/* TOP UP */}
                    <Card
                        id="topup"
                        className="relative flex h-full scroll-mt-24 flex-col rounded-xl border-border bg-card shadow-none backdrop-blur-none"
                    >
                        <CardHeader>
                            <CardTitle className="text-base">{catalog.topUp.title}</CardTitle>
                            <CardDescription className="text-xs">{catalog.topUp.description}</CardDescription>
                            <div className="mt-4">
                                <span className="text-2xl leading-none font-bold tabular-nums">{catalog.topUp.priceLabel}</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ul className="space-y-2 text-xs leading-4">
                                {catalog.topUp.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <CreditCard className="h-3 w-3 shrink-0 text-primary" />
                                        <span className="text-xs leading-4">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full"
                                variant="secondary"
                                onClick={() => handleCheckout(catalog.topUp.planKey, "topup", "one_time")}
                                disabled={!profileKnown || loadingAction !== null}
                            >
                                {loadingAction === "topup"
                                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    : <CirclePlus className="h-4 w-4 mr-2" />}
                                {t("pricing.topup.button")}
                            </Button>
                        </CardFooter>
                    </Card>
                </section>

                {displayError && (
                    <p
                        role="status"
                        aria-live="polite"
                        className="text-center text-sm text-destructive"
                    >
                        {displayError}
                    </p>
                )}

                {/* Footer (All Sizes) */}
                <footer className="pt-2 pb-8">
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6 text-sm text-muted-foreground">
                        <Link href={`/${locale}/policies/refund`} className="hover:text-foreground transition-colors underline">
                            {t("pricing.policies.refund")}
                        </Link>
                        <Link href={`/${locale}/policies/terms`} className="hover:text-foreground transition-colors underline">
                            {t("pricing.policies.terms")}
                        </Link>
                    </div>
                    <p className="mt-3 text-center text-xs text-muted-foreground/60">
                        {t("landing.footerCopyright", { year: new Date().getFullYear() })}
                    </p>
                </footer>
            </div>
        </PageContainer>
    )
}
