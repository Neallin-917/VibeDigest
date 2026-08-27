import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DigestPreview } from "./DigestPreview"

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "zh",
        t: (key: string) => key,
    }),
}))

describe("DigestPreview", () => {
    it("switches between summary, key ideas, and source-grounded follow-up", async () => {
        const user = userEvent.setup()
        render(<DigestPreview />)

        const summaryTab = screen.getByRole("tab", { name: "landing.outputSummary" })
        const ideasTab = screen.getByRole("tab", { name: "landing.outputKeyIdeas" })
        const followUpTab = screen.getByRole("tab", { name: "landing.outputFollowUp" })

        expect(summaryTab).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "digest-panel-brief")

        await user.click(ideasTab)
        expect(ideasTab).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "digest-panel-ideas")
        expect(screen.getByText("landing.previewPointOne")).toBeInTheDocument()

        await user.click(followUpTab)
        expect(followUpTab).toHaveAttribute("aria-selected", "true")
        expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "digest-panel-followUp")
        expect(screen.getByText("landing.previewQuestion")).toBeInTheDocument()
    })

    it("links the illustrative interface to the real public library", () => {
        render(<DigestPreview />)

        expect(screen.getByRole("link", { name: /landing.previewOpen/ })).toHaveAttribute("href", "/zh/explore")
    })
})
