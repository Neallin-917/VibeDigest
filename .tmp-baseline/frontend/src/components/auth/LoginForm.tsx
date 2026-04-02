"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Mail, Sparkles } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { LanguageInlineSelect } from "@/components/i18n/LanguageInlineSelect"

interface LoginFormProps {
    className?: string
    isModal?: boolean
}

export function LoginForm({ className, isModal = false }: LoginFormProps) {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isPasswordLogin, setIsPasswordLogin] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
    const supabase = useMemo(() => createClient(), [])
    const { t, locale } = useI18n()
    const searchParams = useSearchParams()
    const nextUrl = searchParams.get('next')

    const getErrorMessage = (errorMsg: string) => {
        if (errorMsg.includes("Invalid login credentials")) return t("auth.errors.invalidCredentials") || errorMsg
        if (errorMsg.includes("User already registered")) return t("auth.errors.userAlreadyRegistered") || errorMsg
        if (errorMsg.includes("Password should be at least")) return t("auth.errors.weakPassword") || errorMsg
        return errorMsg
    }

    const handleGoogleLogin = async () => {
        setLoading(true)
        const callbackUrl = new URL(`${window.location.origin}/${locale}/auth/callback`)
        if (nextUrl) {
            callbackUrl.searchParams.set('next', nextUrl)
        }
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callbackUrl.toString()
            }
        })
        if (error) setMessage({ type: 'error', text: getErrorMessage(error.message) })
        setLoading(false)
    }

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        const redirectTarget = nextUrl || `/${locale}/chat`

        if (isSignUp) {
            const signUpCallbackUrl = new URL(`${window.location.origin}/auth/callback`)
            if (nextUrl) {
                signUpCallbackUrl.searchParams.set('next', nextUrl)
            }
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: signUpCallbackUrl.toString()
                }
            })
            if (error) {
                setMessage({ type: 'error', text: getErrorMessage(error.message) })
            } else {
                if (data.session) {
                    window.location.href = redirectTarget
                } else {
                    setMessage({ type: 'success', text: t("auth.checkEmailForConfirmation") || "Please check your email to confirm your account." })
                }
            }
        } else if (isPasswordLogin) {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (error) {
                setMessage({ type: 'error', text: getErrorMessage(error.message) })
            } else {
                window.location.href = redirectTarget
            }
        } else {
            const otpCallbackUrl = new URL(`${window.location.origin}/auth/callback`)
            if (nextUrl) {
                otpCallbackUrl.searchParams.set('next', nextUrl)
            }
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: otpCallbackUrl.toString()
                }
            })

            if (error) {
                setMessage({ type: 'error', text: getErrorMessage(error.message) })
            } else {
                setMessage({ type: 'success', text: t("auth.checkYourEmail") })
            }
        }
        setLoading(false)
    }

    // Adaptive card styles based on context
    const cardStyles = isModal
        ? 'shadow-none border-0'
        : 'bg-white/70 dark:bg-black/60 backdrop-blur-xl border border-gray-200/50 dark:border-white/10 shadow-xl ring-1 ring-black/5 dark:ring-white/5'

    return (
        <Card className={`w-full max-w-md relative overflow-hidden transition-all duration-300 ${cardStyles} ${className}`}>
            {!isModal && (
                <div className="absolute top-4 right-4 z-10">
                    <LanguageInlineSelect />
                </div>
            )}

            <CardHeader className="text-center space-y-2 relative z-10">
                <div className="mx-auto bg-emerald-500/10 dark:bg-emerald-500/20 p-3 rounded-full w-fit mb-2 shadow-[0_0_20px_rgba(62,207,142,0.15)]">
                    <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle className="font-bold text-2xl text-gray-900 dark:text-white">
                    {isSignUp ? (t("auth.createAccount") || "Create Account") : t("auth.welcomeBack")}
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                    {isSignUp ? (t("auth.signUpToContinue") || "Sign up to get started") : t("auth.signInToContinue", { appName: t("brand.name") })}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 relative z-10">
                {/* Google Login */}
                <Button
                    variant="outline"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full h-11 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-medium transition-transform hover:scale-[1.01] duration-200 dark:bg-white dark:text-black dark:hover:bg-gray-100 dark:border-0"
                >
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    {t("auth.signInWithGoogle")}
                </Button>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-200 dark:border-white/10" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white/80 dark:bg-black/40 px-3 text-gray-500 dark:text-gray-400 backdrop-blur-sm rounded-full">
                            {isSignUp ? (t("auth.orWithEmail") || "Or with Email") : (isPasswordLogin ? t("auth.orWithEmail") : t("auth.orWithEmail"))}
                        </span>
                    </div>
                </div>

                {/* Email/Password Login */}
                <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            type="email"
                            placeholder={t("auth.emailPlaceholder")}
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="h-11 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                        />
                        {(isPasswordLogin || isSignUp) && (
                            <Input
                                type="password"
                                placeholder={t("auth.passwordPlaceholder") || "Password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                className="h-11 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                            />
                        )}
                    </div>
                    <Button
                        type="submit"
                        className="w-full h-11 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-300"
                        disabled={loading}
                    >
                        <Mail className="h-4 w-4" />
                        {loading ? t("auth.sending") : (
                            isSignUp ? (t("auth.signUp") || "Sign Up") :
                                (isPasswordLogin ? t("auth.signIn") || "Sign In" : t("auth.sendMagicLink"))
                        )}
                    </Button>

                    <div className="flex flex-col gap-2 text-center text-sm">
                        {!isSignUp && (
                            <button
                                type="button"
                                onClick={() => setIsPasswordLogin(!isPasswordLogin)}
                                className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                            >
                                {isPasswordLogin ? (t("auth.useMagicLink") || "Use Magic Link instead") : (t("auth.usePassword") || "Sign in with Password")}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignUp(!isSignUp)
                                setIsPasswordLogin(false)
                                setMessage(null)
                            }}
                            className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                        >
                            {isSignUp ? (t("auth.haveAccount") || "Already have an account? Sign In") : (t("auth.noAccount") || "Don't have an account? Sign Up")}
                        </button>
                    </div>
                </form>

                {message && (
                    <div className={`p-3 rounded-lg text-sm text-center animate-in fade-in slide-in-from-top-2 duration-300 ${message.type === 'error' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'}`}>
                        {message.text}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
