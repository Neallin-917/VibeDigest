import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TranscriptPanel } from "./TranscriptPanel"

describe("TranscriptPanel", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("loads transcript content only after the user expands it", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                language: "en",
                segments: [{ start: 65, text: "A source-grounded transcript segment." }],
            }),
        })
        vi.stubGlobal("fetch", fetchMock)
        const user = userEvent.setup()

        render(<TranscriptPanel taskId="task-1" locale="zh" />)
        expect(fetchMock).not.toHaveBeenCalled()

        await user.click(screen.getByRole("button", { name: /逐字稿/ }))

        expect(await screen.findByText("A source-grounded transcript segment.")).toBeInTheDocument()
        expect(screen.getByText("01:05")).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/transcript", {
            headers: { Accept: "application/json" },
        })
    })

    it("limits the initial DOM and reveals more segments on demand", async () => {
        const segments = Array.from({ length: 121 }, (_, index) => ({
            start: index,
            text: `Segment ${index + 1}`,
        }))
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ language: "en", segments }),
        }))
        const user = userEvent.setup()

        render(<TranscriptPanel taskId="task-1" locale="en" />)
        await user.click(screen.getByRole("button", { name: /Transcript/ }))

        expect(await screen.findByText("Segment 120")).toBeInTheDocument()
        expect(screen.queryByText("Segment 121")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Show more" }))
        expect(screen.getByText("Segment 121")).toBeInTheDocument()
    })
})
