import type { Task } from "./CommunityTemplates"
import type { Locale } from "@/lib/i18n"
import { findPodcastSource } from "@/lib/podcast-sources"

type DemoFixtureSeed = {
    id: string
    video_url: string
    video_title: string
    author: string
    durationLabel: string
    keyPointCount: number
    created_at: string
    publicLocale?: Locale
}

function createDemoThumbnail(seed: DemoFixtureSeed) {
    const palette = [
        { background: "#0f172a", accent: "#10b981", text: "#f8fafc" },
        { background: "#111827", accent: "#22c55e", text: "#f8fafc" },
        { background: "#052e2b", accent: "#34d399", text: "#ecfdf5" },
        { background: "#0b1220", accent: "#6ee7b7", text: "#f8fafc" },
    ][seed.id.length % 4]
    const titleLines = splitTitle(seed.video_title, 30, 3)
    const sourceLine = escapeXml(seed.author.toUpperCase())
    const durationLine = escapeXml(`${seed.durationLabel}   ${seed.keyPointCount} key points`)
    const lineMarkup = titleLines
        .map((line, index) =>
            `<text x="240" y="${180 + index * 68}" fill="${palette.text}" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700">${escapeXml(line)}</text>`
        )
        .join("")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${escapeXml(seed.video_title)}"><rect width="1600" height="900" fill="${palette.background}"/><rect x="240" y="72" width="220" height="10" rx="5" fill="${palette.accent}" opacity="0.9"/><text x="240" y="130" fill="${palette.accent}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="2">${sourceLine}</text>${lineMarkup}<text x="240" y="804" fill="${palette.text}" font-family="Arial, Helvetica, sans-serif" font-size="28" opacity="0.78">${durationLine}</text></svg>`
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function splitTitle(title: string, maxCharsPerLine: number, maxLines: number) {
    const words = title.trim().split(/\s+/)
    const lines: string[] = []
    let current = ""

    for (let index = 0; index < words.length; index += 1) {
        const word = words[index]
        if (lines.length === maxLines - 1) {
            const tail = [current, ...words.slice(index)].filter(Boolean).join(" ")
            lines.push(
                tail.length > maxCharsPerLine
                    ? `${tail.slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd()}…`
                    : tail
            )
            return lines
        }

        const next = current ? `${current} ${word}` : word
        if (next.length <= maxCharsPerLine) {
            current = next
            continue
        }
        if (current) lines.push(current)
        current = word
    }

    if (current) lines.push(current)
    return lines.slice(0, maxLines)
}

function escapeXml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;")
}

function createDemoTask(seed: DemoFixtureSeed): Task {
    return {
        ...seed,
        thumbnail_url: createDemoThumbnail(seed),
        status: "completed",
        is_demo: true,
        publication_status: "published",
        published_at: seed.created_at,
        updated_at: seed.created_at,
        source: findPodcastSource(seed.author, seed.video_url) ?? undefined,
        takeawayLocale: seed.publicLocale ?? null,
    }
}

const DEMO_FIXTURE_TASKS: Task[] = [
    createDemoTask({
        id: "local-demo-latent-space",
        video_url: "https://www.youtube.com/watch?v=KpOW9Pk4BUs",
        video_title: "From Prediction to Simulation: Teaching AI to Shape the Future",
        author: "Latent Space",
        durationLabel: "68 min",
        keyPointCount: 8,
        created_at: "2026-08-24T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-lenny",
        video_url: "https://www.youtube.com/watch?v=YS9In813jJ0",
        video_title: "84 minutes of enterprise sales alpha | Jen Abel",
        author: "Lenny's Podcast",
        durationLabel: "84 min",
        keyPointCount: 7,
        created_at: "2026-08-23T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-every",
        video_url: "https://www.youtube.com/watch?v=LJmwOojvMik",
        video_title: "What the OpenAI and Hugging Face Incident Really Means",
        author: "Every",
        durationLabel: "61 min",
        keyPointCount: 6,
        created_at: "2026-08-22T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-a16z",
        video_url: "https://www.youtube.com/watch?v=0t3TpJXa5-A",
        video_title: "Why the Next Great Founders Will Be Borderless",
        author: "a16z",
        durationLabel: "52 min",
        keyPointCount: 9,
        created_at: "2026-08-21T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-deepmind",
        video_url: "https://www.youtube.com/watch?v=fo9WirRIaVs",
        video_title: "Robots working together with Gemini Robotics 2",
        author: "Google DeepMind",
        durationLabel: "38 min",
        keyPointCount: 6,
        created_at: "2026-08-20T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-tiago",
        video_url: "https://www.youtube.com/watch?v=PwUGO74DYJQ",
        video_title: "Nick Milo Reads My Obsidian Vault Like a Doctor",
        author: "Tiago Forte",
        durationLabel: "47 min",
        keyPointCount: 5,
        created_at: "2026-08-19T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-no-priors",
        video_url: "https://www.youtube.com/watch?v=7HXqMepjvy8",
        video_title: "From Restoring Sight to Reimagining the Brain",
        author: "No Priors",
        durationLabel: "55 min",
        keyPointCount: 8,
        created_at: "2026-08-18T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-anthropic",
        video_url: "https://www.youtube.com/watch?v=iF5IWjOWcA4",
        video_title: "How Icelanders are thinking about AI",
        author: "Anthropic",
        durationLabel: "34 min",
        keyPointCount: 6,
        created_at: "2026-08-17T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-yc",
        video_url: "https://www.youtube.com/watch?v=IfoPg2QefF8",
        video_title: "Going In Deep On Data | YC Paper Club",
        author: "Y Combinator",
        durationLabel: "49 min",
        keyPointCount: 7,
        created_at: "2026-08-16T09:00:00.000Z",
    }),
    createDemoTask({
        id: "local-demo-peter-yang",
        video_url: "https://www.youtube.com/watch?v=bdMHQLvtVaQ",
        video_title: "How to Build Better AI Evals with Claude Code in 5 Steps",
        author: "Peter Yang",
        durationLabel: "42 min",
        keyPointCount: 5,
        created_at: "2026-08-15T09:00:00.000Z",
    }),
]

const LANGUAGE_MISMATCH_DEMO_TASK = createDemoTask({
    id: "local-demo-zh-only",
    video_url: "https://www.youtube.com/watch?v=KpOW9Pk4BUs",
    video_title: "From Prediction to Simulation: Teaching AI to Shape the Future",
    author: "Latent Space",
    durationLabel: "68 min",
    keyPointCount: 8,
    created_at: "2026-08-24T09:00:00.000Z",
    publicLocale: "zh",
})

export function getDemoFixtureTasks(limit: number) {
    return DEMO_FIXTURE_TASKS.slice(0, limit)
}

function createDemoSummary(task: Task, locale: Locale) {
    if (locale === "zh") {
        return {
            version: 4,
            language: "zh",
            tl_dr: `这是一份《${task.video_title}》的本地演示整理，用来展示用户点进播客后可以直接阅读的内容结构。`,
            overview: "正式环境会在这里展示基于节目原文生成的摘要、关键观点和证据。本地演示不冒充真实节目结论。",
            keypoints: [
                {
                    title: "先读结论，再决定是否深入",
                    detail: "详情页先给出简明摘要和少量关键观点，用户不需要从播放器开始寻找价值。",
                    evidence: "本地演示数据",
                    why_it_matters: "降低进入长内容后的判断成本。",
                },
                {
                    title: "保留原节目与继续追问",
                    detail: "用户既能回到原节目，也能基于整理结果继续向 VibeDigest Agent 提问。",
                    evidence: "本地演示数据",
                    why_it_matters: "把浏览、理解和后续探索放在同一条短路径里。",
                },
            ],
            sections: [],
        }
    }

    if (locale === "ja") {
        return {
            version: 4,
            language: "ja",
            tl_dr: `これは「${task.video_title}」のローカルデモ整理で、番組を開いた直後に読める情報構造を示します。`,
            overview: "本番環境では、番組の原文に基づく要約、重要ポイント、根拠を表示します。ローカルデモは実際の番組内容を装いません。",
            keypoints: [
                {
                    title: "最初に結論を確認する",
                    detail: "短い要約と重要ポイントを先に示し、音声全体を聞く前に読む価値を判断できます。",
                    evidence: "ローカルデモデータ",
                    why_it_matters: "長いコンテンツを開いた直後の判断負担を減らします。",
                },
                {
                    title: "元の番組と追加質問を残す",
                    detail: "元の番組へ戻ることも、VibeDigest Agent に整理内容について質問することもできます。",
                    evidence: "ローカルデモデータ",
                    why_it_matters: "閲覧、理解、深掘りを短い導線にまとめます。",
                },
            ],
            sections: [],
        }
    }

    return {
        version: 4,
        language: "en",
        tl_dr: `This local demo digest for “${task.video_title}” shows what a reader can use immediately after opening an episode.`,
        overview: "Production displays a source-grounded summary, key points, and evidence here. The local demo does not pretend to contain findings from the real episode.",
        keypoints: [
            {
                title: "Read the conclusion before going deeper",
                detail: "A concise summary and a small set of key points help readers decide whether the full episode deserves more time.",
                evidence: "Local demo data",
                why_it_matters: "It lowers the cost of evaluating long-form content.",
            },
            {
                title: "Keep the original and follow-up close",
                detail: "Readers can return to the original episode or continue asking the VibeDigest Agent about the organized content.",
                evidence: "Local demo data",
                why_it_matters: "Browsing, understanding, and exploration stay in one short path.",
            },
        ],
        sections: [],
    }
}

export function getDemoFixtureTask(id: string, locale: Locale): Task | null {
    const task = DEMO_FIXTURE_TASKS.find((candidate) => candidate.id === id)
        ?? (LANGUAGE_MISMATCH_DEMO_TASK.id === id ? LANGUAGE_MISMATCH_DEMO_TASK : null)
    if (!task) return null

    const summaryLocale = task.takeawayLocale ?? locale
    const summary = createDemoSummary(task, summaryLocale)
    return {
        ...task,
        takeaway: summary.tl_dr,
        takeawayLocale: summaryLocale,
        task_outputs: [
            {
                kind: "summary",
                content: summary,
                status: "completed",
                locale: summaryLocale,
                created_at: task.created_at,
                updated_at: task.updated_at,
                provenance: { transcript_language: summaryLocale },
            },
        ],
    }
}
