import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDemoFixtureTask } from "@/components/templates/demoFixtures"
import { buildTaskReturnSuffix } from "@/lib/task-navigation"
import { buildTaskSlug } from "@/lib/task-path"

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://www.vibedigest.io" } }))

const db = vi.hoisted(() => ({ task: null as Record<string, unknown> | null, outputs: [] as unknown[] }))
vi.mock("@/lib/local-ui-demo", () => ({ shouldUseDemoFixtures: () => false }))
vi.mock("@/lib/supabase-server", () => ({
    createClient: async () => ({ from: (table: string) => {
        const result = () => ({ data: table === "tasks" ? db.task : db.outputs })
        const query = { select: () => query, eq: () => query, single: result, maybeSingle: result, order: result }
        return query
    } }),
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
