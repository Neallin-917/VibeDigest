import { expect, test } from "@playwright/test"

import { setupApiMocks } from "./fixtures/mock-api"

const TASK_ID = "local-demo-latent-space"
const TASK_PATH = "/zh/tasks/local-demo-latent-space/From-Prediction-to-Simulation%3A-Teaching-AI-to-Shape-the-Future"

test.describe("Public task detail", () => {
    test.beforeEach(async ({ page }) => {
        await setupApiMocks(page, { isAuthenticated: false })
        await page.setViewportSize({ width: 390, height: 844 })
    })

    test("keeps the reading flow concise and does not expose a transcript", async ({ page }) => {
        const pageErrors: string[] = []
        page.on("pageerror", (error) => pageErrors.push(error.message))

        await page.goto(TASK_PATH)

        await expect(page.getByRole("heading", { name: "内容摘要" })).toBeVisible()
        await expect(page.getByRole("heading", { name: "关键观点" })).toBeVisible()
        await expect(page.getByRole("heading", { name: "来源" })).toBeVisible()
        await expect(page.getByText("完整整理", { exact: true })).toBeVisible()
        await expect(page.getByRole("heading", { name: "基于本期内容继续追问" })).toBeVisible()
        await expect(page.getByText("逐字稿", { exact: true })).toHaveCount(0)
        await expect(page.getByRole("link", { name: /打开原视频/ })).toHaveCount(1)

        const readingOrder = await page.evaluate(() => {
            const top = (selector: string) => {
                const element = document.querySelector(selector)
                return element ? element.getBoundingClientRect().top + window.scrollY : null
            }

            return {
                summary: top("#task-summary-title"),
                keyIdeas: top("#task-key-ideas-title"),
                source: top("#task-source-title"),
                fullDigest: top("details.group"),
                followUp: top('[aria-labelledby="task-follow-up-title"]'),
            }
        })

        expect(readingOrder.summary!).toBeLessThan(readingOrder.keyIdeas!)
        expect(readingOrder.keyIdeas!).toBeLessThan(readingOrder.source!)
        expect(readingOrder.source!).toBeLessThan(readingOrder.fullDigest!)
        expect(readingOrder.fullDigest!).toBeLessThan(readingOrder.followUp!)

        await page.getByText("完整整理", { exact: true }).click()
        await expect(page.getByRole("heading", { name: "内容概览" })).toBeVisible()
        await expect(page.getByRole("heading", { name: "内容摘要" })).toHaveCount(1)
        await expect(page.getByRole("heading", { name: "关键观点" })).toHaveCount(1)

        const widthAudit = await page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
        }))
        expect(widthAudit.document).toBe(widthAudit.viewport)

        const transcriptResponse = await page.request.get(`/api/tasks/${TASK_ID}/transcript`)
        expect(transcriptResponse.status()).toBe(404)
        await expect(transcriptResponse.json()).resolves.toEqual({ error: "Not found" })
        expect(pageErrors.filter((message) => message.includes("Hydration failed"))).toEqual([])
    })

    test("keeps a readable two-column hierarchy on desktop", async ({ page }) => {
        const pageErrors: string[] = []
        page.on("pageerror", (error) => pageErrors.push(error.message))
        await page.setViewportSize({ width: 1280, height: 800 })

        await page.goto(TASK_PATH)
        await expect(page.getByRole("region", { name: "基于本期内容继续追问" })).toBeVisible()

        const layoutAudit = await page.evaluate(() => {
            const title = document.querySelector("h1")
            const summary = document.querySelector("#task-summary-title")
            const keyIdeas = document.querySelector("#task-key-ideas-title")
            const source = document.querySelector("#task-source-title")
            const followUpRegion = document.querySelector('[aria-labelledby="task-follow-up-title"]')
            const titleRect = title?.getBoundingClientRect()
            const summaryRect = summary?.getBoundingClientRect()
            const keyIdeasRect = keyIdeas?.getBoundingClientRect()
            const sourceRect = source?.getBoundingClientRect()
            const followUpRect = followUpRegion?.getBoundingClientRect()
            const lineHeight = title ? Number.parseFloat(getComputedStyle(title).lineHeight) : 0

            return {
                titleLines: titleRect && lineHeight ? Math.round(titleRect.height / lineHeight) : null,
                sourceIsRightOfSummary: Boolean(sourceRect && summaryRect && sourceRect.left > summaryRect.left),
                followUpIsAfterKeyIdeas: Boolean(followUpRect && keyIdeasRect && followUpRect.top > keyIdeasRect.bottom),
                mainLandmarks: document.querySelectorAll("main").length,
                viewportWidth: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
            }
        })

        expect(layoutAudit.titleLines).not.toBeNull()
        expect(layoutAudit.titleLines).toBeLessThanOrEqual(2)
        expect(layoutAudit.sourceIsRightOfSummary).toBe(true)
        expect(layoutAudit.followUpIsAfterKeyIdeas).toBe(true)
        expect(layoutAudit.mainLandmarks).toBe(1)
        expect(layoutAudit.documentWidth).toBe(layoutAudit.viewportWidth)
        expect(pageErrors.filter((message) => message.includes("Hydration failed"))).toEqual([])
    })
})
