import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ErrorPage from "./error"
import NotFound from "./not-found"
import { createTranslator, type Locale } from "@/lib/i18n"
import { getCompleteMessages } from "@/lib/i18n-messages"

const localeState = vi.hoisted(() => ({ locale: "en" }))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: localeState.locale,
        t: createTranslator(getCompleteMessages(localeState.locale as Locale)),
    }),
}))

const expectations: Record<Locale, {
    notFound: string
    error: string
    retry: string
    home: string
}> = {
    en: {
        notFound: "Page not found",
        error: "Something went wrong",
        retry: "Try again",
        home: "Home",
    },
    zh: {
        notFound: "页面不存在",
        error: "页面暂时无法显示",
        retry: "重试",
        home: "首页",
    },
}

const localeCases = Object.entries(expectations) as [
    Locale,
    (typeof expectations)[Locale],
][]

describe("localized route fallbacks", () => {
    beforeEach(() => {
        localeState.locale = "en"
        document.title = ""
    })

    it.each(localeCases)("renders the %s not-found page and localized CTA", (locale, expected) => {
        localeState.locale = locale
        render(<NotFound />)

        expect(screen.getByRole("heading", { name: expected.notFound })).toBeInTheDocument()
        expect(screen.getByRole("link", { name: expected.home })).toHaveAttribute("href", `/${locale}`)
        expect(document.title).toBe(expected.notFound)
    })

    it.each(localeCases)("renders the %s error page and retries", (locale, expected) => {
        localeState.locale = locale
        const reset = vi.fn()
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

        render(<ErrorPage error={new Error("test error")} reset={reset} />)
        fireEvent.click(screen.getByRole("button", { name: expected.retry }))

        expect(screen.getByRole("heading", { name: expected.error })).toBeInTheDocument()
        expect(screen.getByRole("link", { name: expected.home })).toHaveAttribute("href", `/${locale}`)
        expect(document.title).toBe(expected.error)
        expect(reset).toHaveBeenCalledTimes(1)

        consoleError.mockRestore()
    })
})
