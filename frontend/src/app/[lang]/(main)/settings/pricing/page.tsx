"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Check, CirclePlus, Loader2, CreditCard, Database } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { ApiClient } from "@/lib/api"
import { cn } from "@/lib/utils"
import { UsageCard, type UsageProfile } from "@/components/settings/UsageCard"
import { Heading, Text } from "@/components/ui/typography"
import { PageContainer } from "@/components/layout/PageContainer"

// Creem Product IDs
const PRO_MONTHLY_PRODUCT_ID = "prod_5XoWWMZN6ptDexocrwyqT0"
const PRO_ANNUAL_PRODUCT_ID = "prod_1pLnYf7AwktcAhRhkjiJTh"
const CREDIT_PACK_PRODUCT_ID = "prod_5VVI5ldN9dtI7tbHaST5OB"
const FREE_PROFILE: UsageProfile = {
    tier: "free",
    usage_count: 0,
    usage_limit: 3,
    extra_credits: 0,
}
type BillingAction = "pro" | "topup" | "portal"

export default function PricingPage() {
    const { t, locale } = useI18n()
    const [isAnnual, setIsAnnual] = useState(true)
    const [paymentMethod] = useState<'card' | 'crypto'>('card')  // Default to Creem (card)
    const [loadingAction, setLoadingAction] = useState<BillingAction | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [profile, setProfile] = useState<UsageProfile | null>(null)
    const [profileLoading, setProfileLoading] = useState(true)
    const [supabase] = useState(() => createClient())

    const fetchProfile = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setProfile(FREE_PROFILE)
                return
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("tier, usage_count, usage_limit, extra_credits")
                .eq("id", user.id)
                .single()

            if (error?.code === "PGRST116") {
                setProfile(FREE_PROFILE)
            } else if (error) {
                console.error("Profile lookup failed:", error)
                setProfile(null)
                setActionError(t("pricing.profileError"))
            } else {
                setProfile(data as UsageProfile)
            }
        } catch (error) {
            console.error("Profile lookup failed:", error)
            setProfile(null)
            setActionError(t("pricing.profileError"))
        } finally {
            setProfileLoading(false)
        }
    }, [supabase, t])

    useEffect(() => {
        // The state write happens after Supabase resolves, not synchronously in the effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchProfile()
    }, [fetchProfile])

    const handleCheckout = async (priceId: string, action: Exclude<BillingAction, "portal">) => {
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
                const res = await ApiClient.createCryptoCharge(priceId, session.access_token)
                url = res.url
            } else {
                const res = await ApiClient.createCheckoutSession(priceId, session.access_token)
                url = res.url
            }

            if (!url) throw new Error("Checkout URL is missing")
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

            const { url } = await ApiClient.createCustomerPortal(session.access_token)
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

    const freeFeatureKeys = [
        "pricing.free.features.f1",
        "pricing.free.features.f4",
        "pricing.free.features.f5",
    ] as const

    const proFeatureKeys = [
        "pricing.pro.features.f1",
        "pricing.pro.features.f2",
    ] as const

    const topupFeatureKeys = [
        "pricing.topup.features.f1",
        "pricing.topup.features.f2",
        "pricing.topup.features.f3",
    ] as const

    return (
        <PageContainer>
            <div className="mx-auto w-full max-w-6xl space-y-8">
                {/* Header + Usage */}
                <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
                    <div className="space-y-3 text-center lg:col-span-7 lg:text-left">
                        <Heading as="h1" variant="h1">
                            {t("pricing.title")}
                        </Heading>
                        <Text tone="muted" className="max-w-2xl mx-auto lg:mx-0">
                            {t(isPro ? "pricing.pro.subtitle" : "pricing.subtitle")}
                        </Text>
                    </div>

                    <div className="lg:col-span-5">
                        <UsageCard profile={profile} loading={profileLoading} className="w-full" />
                    </div>


                </section>

                {/* Pricing Cards */}
                <section className="grid gap-6 auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
                    {/* FREE TIER */}
                    <Card
                        className={cn(
                            "relative flex flex-col h-full border-border/50 bg-background/50 backdrop-blur-sm",
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
                            <CardTitle className="text-base">{t("pricing.free.title")}</CardTitle>
                            <CardDescription className="text-xs">{t("pricing.free.desc")}</CardDescription>
                            <div className="mt-4">
                                <span className="text-2xl leading-none font-bold tabular-nums">{t("pricing.free.price")}</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ul className="space-y-2 text-xs leading-4">
                                {freeFeatureKeys
                                    .map((k) => t(k))
                                    .filter((v) => v && !v.startsWith("pricing."))
                                    .map((feature, i) => (
                                        <li key={i} className="flex items-center gap-2">
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
                        className={cn(
                            "relative flex flex-col h-full border-emerald-500/50 bg-emerald-950/10 backdrop-blur-md shadow-2xl shadow-emerald-500/10",
                            isPro && "ring-2 ring-emerald-500"
                        )}
                    >
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-3 py-1 text-xs">
                                {t("landing.mostPopular")}
                            </Badge>
                        </div>
                        {isPro && (
                            <div className="absolute top-0 right-0 p-4">
                                <Badge className="bg-emerald-500 text-white">{t("pricing.active")}</Badge>
                            </div>
                        )}
                        <CardHeader className="relative pt-8">
                            <div className="flex items-start justify-between gap-4">
                                <Heading as="h3" variant="h3">
                                    {t("pricing.pro.title")}
                                </Heading>
                                {!isPro && (
                                    <div className="flex items-center gap-2">
                                        <Text
                                            as="span"
                                            variant="caption"
                                            weight="semibold"
                                            className={cn(
                                                "tracking-widest uppercase text-[10px]",
                                                isAnnual ? "text-emerald-500" : "text-muted-foreground"
                                            )}
                                        >
                                            {t("pricing.pro.annual")}
                                        </Text>
                                        <Switch
                                            checked={isAnnual}
                                            onCheckedChange={setIsAnnual}
                                            className="scale-75 origin-right data-[state=checked]:bg-emerald-500"
                                        />
                                    </div>
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
                                                {t("pricing.pro.price")}
                                            </Text>
                                        )}
                                        <span className="text-2xl leading-none font-bold tabular-nums">
                                            {isAnnual ? t("pricing.pro.annualPrice") : t("pricing.pro.price")}
                                        </span>
                                        <Text as="span" variant="caption" tone="muted">
                                            {t("pricing.pro.unit")}
                                        </Text>
                                    </div>
                                    {isAnnual && (
                                        <Text variant="caption" tone="muted" className="mt-1 text-[10px]">
                                            {t("pricing.pro.desc")}
                                        </Text>
                                    )}
                                </>
                            )}
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ul className="space-y-2 text-xs leading-4">
                                {proFeatureKeys
                                    .map((k) => t(k))
                                    .filter((v) => v && !v.startsWith("pricing."))
                                    .map((feature, i) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <Check className="h-3 w-3 text-emerald-500" />
                                            <span className="text-xs leading-4">{feature}</span>
                                        </li>
                                    ))}
                            </ul>
                        </CardContent>
                        <CardFooter>
                            {isPro ? (
                                <Button
                                    className="w-full bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600/30 rounded-full"
                                    size="xl"
                                    onClick={handlePortal}
                                    disabled={!profileKnown || loadingAction !== null}
                                >
                                    {loadingAction === "portal" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    {t("pricing.pro.manage")}
                                </Button>
                            ) : (
                                <Button
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-semibold shadow-lg shadow-emerald-500/20"
                                    size="xl"
                                    onClick={() => handleCheckout(
                                        isAnnual ? PRO_ANNUAL_PRODUCT_ID : PRO_MONTHLY_PRODUCT_ID,
                                        "pro",
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
                    <Card className="relative flex flex-col h-full border-border/50 bg-background/50 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{t("pricing.topup.title")}</CardTitle>
                            <CardDescription className="text-xs">{t("pricing.topup.desc")}</CardDescription>
                            <div className="mt-4">
                                <span className="text-2xl leading-none font-bold tabular-nums">{t("pricing.topup.price")}</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <ul className="space-y-2 text-xs leading-4">
                                {topupFeatureKeys
                                    .map((k) => t(k))
                                    .filter((v) => v && !v.startsWith("pricing."))
                                    .map((feature, i) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <CreditCard className="h-3 w-3 text-blue-400" />
                                            <span className="text-xs leading-4">{feature}</span>
                                        </li>
                                    ))}
                            </ul>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full"
                                variant="secondary"
                                onClick={() => handleCheckout(CREDIT_PACK_PRODUCT_ID, "topup")}
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

                {actionError && (
                    <p
                        role="status"
                        aria-live="polite"
                        className="text-center text-sm text-destructive"
                    >
                        {actionError}
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
