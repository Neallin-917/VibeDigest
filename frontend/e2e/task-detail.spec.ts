import { expect, test } from "@playwright/test"

import { setupApiMocks } from "./fixtures/mock-api"

const TASK_ID = "local-demo-latent-space"
const TASK_PATH = "/zh/tasks/local-demo-latent-space/From-Prediction-to-Simulation%3A-Teaching-AI-to-Shape-the-Future"
const LANGUAGE_MISMATCH_TASK_ID = "local-demo-zh-only"
const EN_TASK_PATH = "/en/tasks/local-demo-zh-only/From-Prediction-to-Simulation%3A-Teaching-AI-to-Shape-the-Future"

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
        await expect(page.locator('[data-slot="task-source-media"] img')).toBeVisible()
        await expect(page.getByRole("button", { name: "复制分享链接" })).toBeVisible()
        await expect(page.locator("article")).not.toHaveAttribute("lang", /.+/)
        await expect(page.locator('[aria-labelledby="task-summary-title"] [lang="zh"]').first()).toBeVisible()
        const firstKeypoint = page.locator('details[data-slot="task-keypoint"]').first()
        await expect(firstKeypoint).not.toHaveAttribute("open", "")
        await expect(firstKeypoint.locator("summary")).toContainText("先读结论，再决定是否深入")
        await firstKeypoint.locator("summary").click()
        await expect(firstKeypoint.getByText("本地演示数据", { exact: true })).toBeVisible()
        await expect(firstKeypoint.getByText("本地演示数据", { exact: true })).toHaveAttribute("lang", "zh")
        await firstKeypoint.locator("summary").click()
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/)
        const jsonLdPayloads = await page.locator('script[type="application/ld+json"]').allTextContents()
        const articleJsonLd = jsonLdPayloads
            .map((payload) => JSON.parse(payload) as { "@type"?: string; inLanguage?: string })
            .find((payload) => payload["@type"] === "Article")
        expect(articleJsonLd).toMatchObject({ "@type": "Article", inLanguage: "zh" })
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
                source: top('[data-slot="task-source-media"]'),
                fullDigest: top("details.group"),
                followUp: top('[aria-labelledby="task-follow-up-title"]'),
            }
        })

        expect(readingOrder.summary!).toBeLessThan(readingOrder.keyIdeas!)
        expect(readingOrder.source!).toBeLessThan(readingOrder.keyIdeas!)
        expect(readingOrder.keyIdeas!).toBeLessThan(readingOrder.followUp!)
        expect(readingOrder.followUp!).toBeLessThan(readingOrder.fullDigest!)

        await page.evaluate(() => window.scrollTo(0, 0))
        const mobileHero = await page.evaluate(() => {
            const title = document.querySelector("h1")?.getBoundingClientRect()
            const source = document.querySelector('[data-slot="task-source-media"]')?.getBoundingClientRect()
            const summary = document.querySelector('[aria-labelledby="task-summary-title"]')?.getBoundingClientRect()
            return {
                titleIsAboveMedia: Boolean(title && source && title.bottom <= source.top),
                mediaAndSummaryAreSideBySide: Boolean(source && summary && (
                    source.right <= summary.left || summary.right <= source.left
                ) && Math.max(source.top, summary.top) < Math.min(source.bottom, summary.bottom)),
                mediaIsInFirstViewport: Boolean(source && source.top >= 0 && source.bottom <= window.innerHeight),
            }
        })
        expect(mobileHero.titleIsAboveMedia).toBe(true)
        expect(mobileHero.mediaAndSummaryAreSideBySide).toBe(true)
        expect(mobileHero.mediaIsInFirstViewport).toBe(true)

        await page.getByText("完整整理", { exact: true }).click()
        await expect(page.getByRole("heading", { name: "内容概览" })).toBeVisible()
        await expect(page.getByRole("heading", { name: "内容概览" })).not.toHaveAttribute("lang", /.+/)
        await expect(page.locator("details.group").locator('p[lang="zh"]').first()).toBeVisible()
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

    test("opens and closes key ideas with the keyboard while preserving the preview", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(TASK_PATH)

        const keypoint = page.locator('details[data-slot="task-keypoint"]').first()
        const toggle = keypoint.locator('summary')
        const evidence = keypoint.getByText("本地演示数据", { exact: true })
        await expect(keypoint).not.toHaveAttribute('open', '')
        await expect(toggle).toContainText("详情页先给出简明摘要和少量关键观点")
        await expect(evidence).not.toBeVisible()

        await toggle.focus()
        await page.keyboard.press('Enter')
        await expect(keypoint).toHaveAttribute('open', '')
        await expect(evidence).toBeVisible()
        await expect(keypoint.getByText("降低进入长内容后的判断成本。", { exact: true })).toBeVisible()

        await page.keyboard.press('Space')
        await expect(keypoint).not.toHaveAttribute('open', '')
        await expect(evidence).not.toBeVisible()
        await expect(toggle).toBeVisible()
        await expect(toggle).toBeFocused()
    })

    test("hides mismatched public digest sections on the english route and links to the supported locale", async ({ page }) => {
        await page.goto(EN_TASK_PATH)

        await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible()
        await expect(page.getByText("This digest is currently available in Chinese.")).toBeVisible()
        const languageSwitch = page.getByRole("link", { name: "Open the Chinese version" })
        await expect(languageSwitch).toHaveAttribute(
            "href",
            `/zh/tasks/${LANGUAGE_MISMATCH_TASK_ID}/From-Prediction-to-Simulation%3A-Teaching-AI-to-Shape-the-Future`
        )
        await expect(page.getByRole("heading", { name: "Key ideas" })).toHaveCount(0)
        await expect(page.getByText("Read the full digest", { exact: true })).toHaveCount(0)
        await expect(page.getByText("本地演示数据")).toHaveCount(0)
        await expect(page.locator('[data-slot="task-keypoint"]')).toHaveCount(0)
        await expect(page.locator('article [lang="zh"]')).toHaveCount(0)
        await expect(page.getByRole("heading", { name: "Source", exact: true })).toBeVisible()
        await expect(page.getByRole("heading", { name: "Ask about this source" })).toBeVisible()
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
        const jsonLdPayloads = await page.locator('script[type="application/ld+json"]').allTextContents()
        const articleJsonLd = jsonLdPayloads
            .map((payload) => JSON.parse(payload) as { "@type"?: string })
            .find((payload) => payload["@type"] === "Article")
        expect(articleJsonLd).toBeUndefined()
        await expect(page.getByText("Transcript", { exact: true })).toHaveCount(0)

        const widthAudit = await page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
        }))
        expect(widthAudit.document).toBe(widthAudit.viewport)

        await languageSwitch.click()
        await expect(page).toHaveURL(new RegExp(`/zh/tasks/${LANGUAGE_MISMATCH_TASK_ID}/`))
        await expect(page.getByRole("heading", { name: "关键观点" })).toBeVisible()
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
            const source = document.querySelector('[data-slot="task-source-media"]')
            const followUpRegion = document.querySelector('[aria-labelledby="task-follow-up-title"]')
            const titleRect = title?.getBoundingClientRect()
            const summaryRect = summary?.getBoundingClientRect()
            const keyIdeasRect = keyIdeas?.getBoundingClientRect()
            const sourceRect = source?.getBoundingClientRect()
            const followUpRect = followUpRegion?.getBoundingClientRect()
            const fullDigestRect = document.querySelector("details.group")?.getBoundingClientRect()

            return {
                sourceIsRightOfTitle: Boolean(sourceRect && titleRect && sourceRect.left >= titleRect.right),
                summaryIsBelowTitle: Boolean(summaryRect && titleRect && summaryRect.top >= titleRect.bottom),
                sourceIsInFirstViewport: Boolean(sourceRect && sourceRect.top >= 0 && sourceRect.bottom <= window.innerHeight),
                sourceIsRightOfSummary: Boolean(sourceRect && summaryRect && sourceRect.left >= summaryRect.right),
                followUpIsBeforeFullDigest: Boolean(followUpRect && fullDigestRect && followUpRect.bottom <= fullDigestRect.top),
                followUpIsAfterKeyIdeas: Boolean(followUpRect && keyIdeasRect && followUpRect.top > keyIdeasRect.bottom),
                mainLandmarks: document.querySelectorAll("main").length,
                viewportWidth: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
            }
        })

        expect(layoutAudit.sourceIsRightOfTitle).toBe(true)
        expect(layoutAudit.summaryIsBelowTitle).toBe(true)
        expect(layoutAudit.sourceIsInFirstViewport).toBe(true)
        expect(layoutAudit.followUpIsBeforeFullDigest).toBe(true)
        expect(layoutAudit.sourceIsRightOfSummary).toBe(true)
        expect(layoutAudit.followUpIsAfterKeyIdeas).toBe(true)
        expect(layoutAudit.mainLandmarks).toBe(1)
        expect(layoutAudit.documentWidth).toBe(layoutAudit.viewportWidth)
        expect(pageErrors.filter((message) => message.includes("Hydration failed"))).toEqual([])
    })
})
