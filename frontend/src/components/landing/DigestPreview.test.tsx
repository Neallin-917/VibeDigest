import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DigestPreview } from "./DigestPreview"

const i18n = vi.hoisted(() => ({ locale: "zh" }))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: i18n.locale,
        t: (key: string) => key,
    }),
}))

describe("DigestPreview", () => {
    beforeEach(() => { i18n.locale = "zh" })

    it("shows the real task-detail reading hierarchy without dashboard controls", () => {
        render(<DigestPreview />)

        const preview = screen.getByRole("region", { name: "landing.previewTitle" })

        expect(within(preview).getByRole("heading", { name: "landing.outputSummary" })).toBeVisible()
        expect(within(preview).queryByRole("heading", { name: "landing.outputFollowUp" })).not.toBeInTheDocument()
        expect(within(preview).getByText("landing.previewQuestion")).toBeVisible()
        expect(within(preview).getByText("landing.previewAnswer")).toBeVisible()
        expect(within(preview).getByRole("heading", { name: "landing.outputKeyIdeas" })).toBeVisible()
        expect(within(preview).getByText("landing.previewPointOne")).toBeVisible()
        expect(within(preview).getByText("landing.previewPointTwo")).toBeVisible()

        const source = within(preview).getByRole("complementary", { name: "landing.previewSourceLabel" })
        expect(within(source).getByRole("heading", { name: "landing.previewTitle" })).toBeVisible()
        expect(within(source).getByRole("link", { name: /landing.previewSourceLabel.*landing.previewTitle/ })).toBeVisible()
        expect(within(source).queryByText("landing.previewSourceType")).not.toBeInTheDocument()
        expect(within(preview).queryByText("landing.previewKicker")).not.toBeInTheDocument()

        expect(within(preview).queryByRole("tablist")).not.toBeInTheDocument()
        expect(within(preview).queryByText("landing.previewReady")).not.toBeInTheDocument()
        expect(within(preview).queryByText("landing.previewSourceMap")).not.toBeInTheDocument()
    })

    it.each(["en", "zh"])("opens the current episode in the %s agent conversation", (locale) => {
        i18n.locale = locale
        render(<DigestPreview />)

        expect(screen.getAllByRole("link", { name: /landing.previewOpen/ })).toHaveLength(1)
        expect(screen.getByRole("link", { name: /landing.previewOpen/ })).toHaveAttribute(
            "href", `/${locale}/chat?task=3a6c1431-239b-49f2-89be-00f3f52f59bc`
        )
    })

    it("keeps the Japanese preview visible without offering an unavailable summary conversation", () => {
        i18n.locale = "ja"
        render(<DigestPreview />)

        const preview = screen.getByRole("region", { name: "landing.previewTitle" })
        expect(within(preview).queryByRole("link", { name: /landing.previewOpen/ })).not.toBeInTheDocument()
        expect(within(preview).getByText("landing.previewBrief")).toBeVisible()
        expect(within(preview).getByText("landing.previewPointOne")).toBeVisible()
        expect(within(preview).getByText("landing.previewPointTwo")).toBeVisible()
        expect(within(preview).getByText("landing.previewQuestion")).toBeVisible()
        expect(within(preview).getByText("landing.previewAnswer")).toBeVisible()
        expect(within(preview).getByAltText("")).toBeVisible()
    })

    it("serves responsive optimized cover candidates", () => {
        render(<DigestPreview />)

        const cover = screen.getByAltText("")
        expect(cover).toHaveAttribute("sizes", expect.any(String))
        expect(cover).toHaveAttribute("srcset", expect.stringMatching(/\/_next\/image\?.+ \d+w/))
    })

    it("keeps the original episode accessible when its cover cannot load", () => {
        render(<DigestPreview />)

        const source = screen.getByRole("link", { name: /landing.previewSourceLabel.*landing.previewTitle/ })
        expect(source).toHaveAttribute("href", "https://youtube.com/watch?v=zgNvts_2TUE")
        expect(source).toHaveAttribute("rel", "noopener noreferrer")

        fireEvent.error(within(source).getByAltText(""))

        expect(within(source).queryByAltText("")).not.toBeInTheDocument()
        expect(within(source).getByText("landing.previewTitle")).toBeVisible()
        expect(source).toHaveAttribute("href", "https://youtube.com/watch?v=zgNvts_2TUE")
    })
})
