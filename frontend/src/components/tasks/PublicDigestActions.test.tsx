import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))

vi.mock("@/lib/growth-events", () => growth)

import { PublicDigestActions } from "./PublicDigestActions"

describe("PublicDigestActions", () => {
  const writeText = vi.fn()

  beforeEach(() => {
    growth.trackGrowthEvent.mockReset()
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
  })

  it("records one public open and a successful canonical link copy with source and locale", async () => {
    render(
      <PublicDigestActions
        canonicalUrl="https://vibedigest.io/zh/tasks/task-123/title"
        locale="zh"
        source="latent-space"
        copy={{ share: "复制分享链接", copied: "已复制", copyFailed: "复制失败" }}
      />,
    )

    await waitFor(() => {
      expect(growth.trackGrowthEvent).toHaveBeenCalledWith("public_digest_view", {
        locale: "zh",
        source: "latent-space",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "复制分享链接" }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      "https://vibedigest.io/zh/tasks/task-123/title",
    ))
    expect(growth.trackGrowthEvent).toHaveBeenCalledWith("public_digest_share", {
      locale: "zh",
      source: "latent-space",
      method: "copy_link",
    })
    expect(await screen.findByRole("button", { name: "已复制" })).toBeInTheDocument()
  })

  it("does not record a share when the clipboard write fails", async () => {
    writeText.mockRejectedValue(new Error("clipboard unavailable"))
    render(
      <PublicDigestActions
        canonicalUrl="https://vibedigest.io/en/tasks/task-123/title"
        locale="en"
        source="latent-space"
        copy={{ share: "Copy share link", copied: "Copied", copyFailed: "Copy failed" }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Copy share link" }))

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeInTheDocument()
    expect(growth.trackGrowthEvent).not.toHaveBeenCalledWith(
      "public_digest_share",
      expect.anything(),
    )
  })
})
