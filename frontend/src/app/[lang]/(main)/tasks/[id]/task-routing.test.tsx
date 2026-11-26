import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDemoFixtureTask } from "@/components/templates/demoFixtures"
import { buildTaskReturnSuffix } from "@/lib/task-navigation"
import { buildTaskSlug } from "@/lib/task-path"
import { isValidElement } from "react"

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://www.vibedigest.io" } }))

const db = vi.hoisted(() => ({
    task: null as Record<string, unknown> | null,
    outputs: [] as unknown[],
    taskError: null as unknown,
    taskColumns: "",
    from: vi.fn(),
    filters: vi.fn(),
    order: vi.fn(),
}))
vi.mock("@/lib/local-ui-demo", () => ({ shouldUseDemoFixtures: () => false }))
vi.mock("@/lib/supabase-server", () => ({
    createClient: async () => ({ from: db.from }),
}))
vi.mock("next/navigation", () => ({
    redirect: (href: string) => { throw new Error(`307:${href}`) },
    permanentRedirect: (href: string) => { throw new Error(`308:${href}`) },
    notFound: () => { throw new Error("404") },
}))
import TaskDetailPage, { generateMetadata } from "./[slug]/page"
import TaskRedirectPage from "./page"

const id = "local-demo-latent-space"
const threadId = "29c0dcda-9ea7-4644-9aba-a2dd749ecf80"
const from = "/en/topics/research?show=latent-space&q=AI&page=3#episode-example"
const state = { from, threadId }
const suffix = `?${new URLSearchParams(state)}`
function props(slug: string, lang = "en") {
    return { params: Promise.resolve({ id, lang, slug }), searchParams: Promise.resolve(state) }
}

beforeEach(() => {
    const fixture = getDemoFixtureTask(id, "en")!
    db.task = { ...fixture }
    db.outputs = fixture.task_outputs || []
    db.taskError = null
    db.taskColumns = ""
    db.from.mockReset()
    db.filters.mockClear()
    db.order.mockClear()
    const result = () => ({ data: db.task && { ...db.task, task_outputs: db.outputs }, error: db.taskError })
    const query = {
        select: (columns: string) => { db.taskColumns = columns; return query },
        eq: db.filters,
        order: db.order,
        single: result,
        maybeSingle: result,
    }
    db.filters.mockReturnValue(query)
    db.order.mockReturnValue(query)
    db.from.mockReturnValue(query)
})

describe("task URL aliases", () => {
    it.each(["en", "zh"])("preserves navigation through the ID-only %s entry", async (lang) => {
        await expect(TaskRedirectPage(props("", lang))).rejects.toThrow(
            `307:/${lang}/tasks/${id}/${buildTaskSlug(db.task!.video_title as string)}${suffix}`,
        )
    })
    it.each([
        ["AI Is Learning to Hack. Faster Than We Expected.", "AI-Is-Learning-to-Hack.-Faster-Than-We-Expected"],
        ["Chasing Companies, Budgets, & Capture", "Chasing-Companies%2c-Budgets%2c-%26-Capture"],
        ["中文 100%", "old-slug"],
    ])("permanently consolidates a public variant of %s with its navigation intact", async (title, slug) => {
        db.task!.video_title = title
        await expect(TaskDetailPage(props(slug))).rejects.toThrow(
            `308:/en/tasks/${id}/${buildTaskSlug(title)}${suffix}`,
        )
    })
    it.each(["AI Is Learning to Hack.", "Companies, Budgets, & Capture", "中文 100%", "Literal %2E"])(
        "renders canonical encoded slug without redirecting: %s", async (title) => {
            db.task!.video_title = title
            await expect(TaskDetailPage(props(buildTaskSlug(title)))).resolves.toBeTruthy()
            const metadata = await generateMetadata(props(buildTaskSlug(title)))
            expect(metadata.alternates?.canonical).toBe(`https://www.vibedigest.io/en/tasks/${id}/${buildTaskSlug(title)}`)
            expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical)
            expect(metadata.robots).toEqual({ index: true, follow: true })
        },
    )
    it("does not make private aliases permanent or indexable", async () => {
        db.task!.publication_status = "private"
        await expect(TaskDetailPage(props("old"))).rejects.toThrow("307:")
        expect((await generateMetadata(props("old"))).robots).toEqual({ index: false, follow: false, noarchive: true })
    })
    it("does not permanently redirect a locale without a published summary", async () => {
        await expect(TaskDetailPage(props("old", "zh"))).rejects.toThrow("307:")
        expect((await generateMetadata(props("old", "zh"))).robots).toEqual({ index: false, follow: false, noarchive: true })
    })
    it.each(["missing", "pending", "invalid", "not-demo", "not-completed"])("keeps %s summary/task aliases temporary", async (variant) => {
        if (variant === "missing") db.outputs = []
        if (variant === "pending") db.outputs = [{ kind: "summary", status: "pending", locale: "en" }]
        if (variant === "invalid") db.outputs = [{ kind: "summary", status: "completed", locale: "en", content: {} }]
        if (variant === "not-demo") db.task!.is_demo = false
        if (variant === "not-completed") db.task!.status = "processing"
        await expect(TaskDetailPage(props("old"))).rejects.toThrow("307:")
    })
    it("localizes validated return navigation when switching summary language", () => {
        const query = new URLSearchParams(buildTaskReturnSuffix(state, "en", "zh"))
        expect(query.get("from")).toBe(from.replace("/en/", "/zh/"))
        expect(query.get("threadId")).toBe(threadId)
    })
    it("does not disclose a title or redirect when RLS returns no task", async () => {
        db.task = null
        await expect(TaskDetailPage(props("old"))).rejects.toThrow("404")
        await expect(TaskRedirectPage(props(""))).rejects.toThrow("404")
    })
    it("drops external and repeated return parameters on the ID entry", async () => {
        await expect(TaskRedirectPage({ ...props(""), searchParams: Promise.resolve({ from: "https://evil.invalid", threadId: [threadId] }) }))
            .rejects.toEqual(new Error(`307:/en/tasks/${id}/${buildTaskSlug(db.task!.video_title as string)}`))
    })
})


function treeText(node: unknown): string {
    if (typeof node === "string") return node
    if (Array.isArray(node)) return node.map(treeText).join(" ")
    if (isValidElement<{ children?: unknown }>(node)) return treeText(node.props.children)
    return ""
}

describe("task detail source failures", () => {
    it.each([
        ["en", "captions_unavailable: provider_unavailable", "The caption service is temporarily unavailable. Submit this video again later."],
        ["en", "captions_unavailable: rate_limited", "Caption requests are temporarily limited. Submit this video again later."],
        ["zh", "captions_unavailable: provider_unavailable", "字幕服务暂时无法响应，请稍后重新提交此视频。"],
        ["zh", "captions_unavailable: rate_limited", "字幕服务暂时限流，请稍后重新提交此视频。"],
        ["en", "captions_unavailable", "We couldn’t retrieve usable captions for this video. Try another YouTube video with captions."],
        ["zh", "captions_unavailable", "这次未能取得可用字幕，请试试其他带字幕的 YouTube 视频。"],
        ["en", "unsupported_source", "This source is not supported. Try a YouTube video with existing captions."],
        ["zh", "unsupported_source", "暂不支持此来源，请换一个已有字幕的 YouTube 视频。"],
    ])("shows an actionable %s %s message without promising retry or refund", async (locale, code, expected) => {
        db.task!.status = "error"
        db.task!.error_message = `${code}: internal diagnostic`
        db.outputs = []

        const text = treeText(await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string), locale)))

        expect(text).toContain(expected)
        expect(db.taskColumns.split(", ")).toContain("error_message")
        expect(text).not.toMatch(/retry it below|在下方重试|internal diagnostic|refund|退还|退额/i)
    })

    it("retains retry guidance for a recoverable failure", async () => {
        db.task!.status = "failed"
        db.task!.error_message = "Temporary upstream failure"
        db.outputs = []

        const text = treeText(await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string))))

        expect(text).toContain("This task did not complete. You can retry it below.")
    })
})

describe("task detail read", () => {
    it("reads the task and newest summaries together through a left embed", async () => {
        await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string)))
        expect(db.from.mock.calls).toEqual([["tasks"]])
        expect(db.taskColumns).toContain("task_outputs(kind, content, status, locale, created_at, updated_at, provenance)")
        expect(db.filters.mock.calls).toEqual([["id", id], ["task_outputs.kind", "summary"]])
        expect(db.order).toHaveBeenCalledWith("created_at", { referencedTable: "task_outputs", ascending: false })
    })

    it("returns 404 when the task is absent", async () => {
        db.task = null
        await expect(TaskDetailPage(props("old"))).rejects.toThrow("404")
    })

    it("preserves a database error as the cause", async () => {
        db.taskError = new Error("Task query failed")
        await expect(TaskDetailPage(props("old"))).rejects.toMatchObject({
            message: "Failed to load task details", cause: db.taskError,
        })
    })
})

describe("task reading navigation", () => {
    function elements(node: unknown): Array<{ type: unknown; props: Record<string, unknown> }> {
        if (Array.isArray(node)) return node.flatMap(elements)
        if (!isValidElement<Record<string, unknown>>(node)) return []
        return [{ type: node.type, props: node.props }, ...elements(node.props.children)]
    }

    it.each([["en", "transcribed, translated, or paraphrased"], ["zh", "转录、翻译或转述"]])("explains the provenance of supporting text once in %s", async (lang, wording) => {
        db.outputs = [{ kind: "summary", status: "completed", locale: lang, content: {
            version: 5, language: lang, overview: "Overview", keypoints: [
                { title: "Claim", detail: "Explanation", evidence: "Saved supporting words" },
                { title: "Another claim", detail: "Another explanation", evidence: "Another passage" },
            ],
        } }]
        const nodes = elements(await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string), lang)))
        const paragraphs = nodes.filter(node => node.type === "p").map(node => treeText(node.props.children))
        expect(paragraphs.filter(text => text.includes(wording))).toHaveLength(1)
        expect(paragraphs).toContain("Saved supporting words")
    })

    it.each([
        ["en", "https://www.youtube.com/watch?v=source", undefined, "https://www.youtube.com/watch?v=source", "Open original source"],
        ["zh", "https://www.youtube.com/watch?v=source", undefined, "https://www.youtube.com/watch?v=source", "查看原始来源"],
        ["en", "https://youtu.be/source?t=5s", 74.8, "https://youtu.be/source?t=74s", "Open source at 1:14"],
        ["zh", "https://www.youtube.com/watch?v=source", 0, "https://www.youtube.com/watch?v=source&t=0s", "打开原视频时间点 0:00"],
        ["en", "https://www.youtube.com/shorts/source", 100, "https://www.youtube.com/watch?v=source&t=100s", "Open source at 1:40"],
        ["en", "https://www.youtube-nocookie.com/embed/source", 30, "https://www.youtube-nocookie.com/embed/source?start=30", "Open source at 0:30"],
        ["en", "youtube.com/watch?v=source", 8, "https://youtube.com/watch?v=source&t=8s", "Open source at 0:08"],
        ["en", "https://www.youtu.be/source", 2, "https://www.youtu.be/source?t=2s", "Open source at 0:02"],
        ["en", "https://www.youtube.com/watch/?v=source&list=p#t=42", 6, "https://www.youtube.com/watch/?v=source&list=p&t=6s", "Open source at 0:06"],
        ["en", "https://www.youtube.com/live/source", 6, "https://www.youtube.com/watch?v=source&t=6s", "Open source at 0:06"],
        ["en", "https://www.youtube.com/embed/source?start=60&t=80s#chapter", 10, "https://www.youtube.com/embed/source?start=10#chapter", "Open source at 0:10"],
        ["en", "https://podcasts.apple.com/episode/id1", 100, "https://podcasts.apple.com/episode/id1", "Open original source"],
        ["en", "https://youtu.be/source", -3, "https://youtu.be/source", "Open original source"],
        ["en", "", 23, null, null],
        ["en", "ftp://example.com/public.txt", 23, null, null],
        ["en", "invalid source", 23, null, null],
    ] as const)("links the evidence to its source for %s %s at %s", async (lang, source, startSeconds, href, label) => {
        db.task!.video_url = source
        db.outputs = [{ kind: "summary", status: "completed", locale: lang, content: {
            version: 5, language: lang, overview: "Overview", keypoints: [
                { title: "Claim", detail: "Explanation", evidence: "Quotation", startSeconds },
            ],
        } }]
        const nodes = elements(await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string), lang)))
        const link = nodes.find(node => node.type === "a" && node.props["aria-describedby"] === "task-idea-0")
        if (!href) {
            expect(link).toBeUndefined()
            expect(nodes.some(node => node.type === "a" && node.props.href === source)).toBe(false)
            return
        }
        expect(link?.props.href).toBe(href)
        expect(treeText(link?.props.children)).toContain(label)
    })

    it("links every reading entry to an actual rendered section, including key ideas", async () => {
        const nodes = elements(await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string))))
        const navigation = nodes.find(node => typeof node.type === "function" && node.type.name === "TaskReadingNav")!
        const items = navigation.props.items as Array<{ id: string; depth?: number }>
        const ids = nodes.map(node => node.props.id).filter(Boolean)
        expect(items.some(item => item.depth === 1)).toBe(true)
        expect(items.map(item => item.id)).toContain("task-full-summary-title")
        for (const item of items) expect(ids).toContain(item.id)
        expect(new Set(items.map(item => item.id)).size).toBe(items.length)
    })

    it.each(["pending", "other-locale"])("omits unavailable content from navigation for %s", async mode => {
        if (mode === "pending") { db.task!.status = "processing"; db.outputs = [] }
        const locale = mode === "other-locale" ? "zh" : "en"
        const nodes = elements(await TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string), locale)))
        const navigation = nodes.find(node => typeof node.type === "function" && node.type.name === "TaskReadingNav")!
        const items = navigation.props.items as Array<{ id: string }>
        expect(items.map(item => item.id)).toEqual(["task-summary-title", "task-follow-up"])
    })
})

function versionStatus(node: unknown): string | undefined {
    if (Array.isArray(node)) return node.map(versionStatus).find(Boolean)
    if (!isValidElement<{ children?: unknown, target?: string, status?: string }>(node)) return
    if (node.props.target && node.props.status) return `${node.props.target}:${node.props.status}`
    return versionStatus(node.props.children)
}

describe("reading a private digest in the owner's preferred language", () => {
    beforeEach(() => {
        Object.assign(db.task!, { is_demo: false, workload_kind: "user_submission", publication_status: "private" })
    })
    const page = () => TaskDetailPage(props(buildTaskSlug(db.task!.video_title as string), "zh"))

    it("preserves an Agent version link through both canonical redirects", async () => {
        const args = { ...props("old", "zh"), searchParams: Promise.resolve({ version: "en" }) }
        const expected = `307:/zh/tasks/${id}/${buildTaskSlug(db.task!.video_title as string)}?version=en`
        await expect(TaskRedirectPage(args)).rejects.toThrow(expected)
        await expect(TaskDetailPage(args)).rejects.toThrow(expected)
        expect(buildTaskReturnSuffix({ version: ["en", "zh"] }, "zh")).toBe("")
        expect(buildTaskReturnSuffix({ version: "fr" }, "zh")).toBe("")
    })

    it("renders every saved keypoint in the owner's digest", async () => {
        db.outputs = [{ kind: "summary", locale: "zh", status: "completed", content: {
            version: 5, language: "zh", overview: "本期概览",
            keypoints: Array.from({ length: 6 }, (_, index) => ({
                title: `观点 ${index + 1}`, detail: `完整解释 ${index + 1}`, evidence: "Source evidence",
            })),
        } }]
        expect(treeText(await page())).toContain("完整解释 6")
    })

    it("prepares the interface language on open while offering the existing version", async () => {
        const result = await page()
        expect(versionStatus(result)).toBe("zh:request")
        expect(treeText(result)).toContain("打开英文版本")
        const args = props(buildTaskSlug(db.task!.video_title as string), "zh")
        const english = await TaskDetailPage({ ...args, searchParams: Promise.resolve({ ...state, version: "en" }) })
        expect(versionStatus(english)).toBeUndefined()
    })

    it("shows the explicit original language until the owner requests another", async () => {
        Object.assign(db.task!, { locale_source: "explicit_instruction", target_locale: "en" })
        expect(versionStatus(await page())).toBeUndefined()
        db.task!.preferred_summary_locale = "zh"
        db.outputs.push({ kind: "summary", locale: "zh", status: "pending" })
        expect(versionStatus(await page())).toBe("zh:waiting")
    })

    it("does not automatically retry failed versions or request one for public readers", async () => {
        db.outputs.push({ kind: "summary", locale: "zh", status: "failed" })
        expect(versionStatus(await page())).toBe("zh:unavailable")
        db.task!.is_demo = true
        expect(versionStatus(await page())).toBeUndefined()
    })
})
