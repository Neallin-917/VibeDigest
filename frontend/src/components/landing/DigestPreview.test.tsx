import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DigestPreview } from "./DigestPreview"

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "zh",
        t: (key: string) => key,
    }),
}))

describe("DigestPreview", () => {
    it("shows the real task-detail reading hierarchy without dashboard controls", () => {
        render(<DigestPreview />)

        const preview = screen.getByRole("region", { name: "landing.previewTitle" })

        expect(within(preview).getByRole("heading", { name: "landing.outputSummary" })).toBeVisible()
        expect(within(preview).getByRole("heading", { name: "landing.outputFollowUp" })).toBeVisible()
        expect(within(preview).getByText("landing.previewQuestion")).toBeVisible()
        expect(within(preview).getByText("landing.previewAnswer")).toBeVisible()
        expect(within(preview).getByRole("heading", { name: "landing.outputKeyIdeas" })).toBeVisible()
        expect(within(preview).getByText("landing.previewPointOne")).toBeVisible()
        expect(within(preview).getByText("landing.previewPointTwo")).toBeVisible()

        const source = within(preview).getByRole("complementary", { name: "landing.previewSourceLabel" })
        expect(within(source).getByText("landing.previewSourceName")).toBeVisible()
        expect(within(source).getByText("landing.previewSourceType")).toBeVisible()

        expect(within(preview).queryByRole("tablist")).not.toBeInTheDocument()
        expect(within(preview).queryByText("landing.previewReady")).not.toBeInTheDocument()
        expect(within(preview).queryByText("landing.previewSourceMap")).not.toBeInTheDocument()
    })

    it("links the illustrative interface to the real public library", () => {
        render(<DigestPreview />)

        expect(screen.getByRole("link", { name: /landing.previewOpen/ })).toHaveAttribute("href", "/zh/explore")
    })
})
