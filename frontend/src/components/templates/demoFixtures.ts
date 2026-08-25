import type { Task } from "./CommunityTemplates"
import type { Locale } from "@/lib/i18n"

const DEMO_FIXTURE_TASKS: Task[] = [
    {
        id: "local-demo-latent-space",
        video_url: "https://www.youtube.com/watch?v=KpOW9Pk4BUs",
        video_title: "From Prediction to Simulation: Teaching AI to Shape the Future",
        thumbnail_url: "https://i.ytimg.com/vi/KpOW9Pk4BUs/maxresdefault.jpg",
        author: "Latent Space",
        durationLabel: "68 min",
        keyPointCount: 8,
        status: "completed",
        created_at: "2026-08-24T09:00:00.000Z",
    },
    {
        id: "local-demo-lenny",
        video_url: "https://www.youtube.com/watch?v=YS9In813jJ0",
        video_title: "84 minutes of enterprise sales alpha | Jen Abel",
        thumbnail_url: "https://i.ytimg.com/vi/YS9In813jJ0/maxresdefault.jpg",
        author: "Lenny's Podcast",
        durationLabel: "84 min",
        keyPointCount: 7,
        status: "completed",
        created_at: "2026-08-23T09:00:00.000Z",
    },
    {
        id: "local-demo-every",
        video_url: "https://www.youtube.com/watch?v=LJmwOojvMik",
        video_title: "What the OpenAI–Hugging Face Incident Really Means",
        thumbnail_url: "https://i.ytimg.com/vi/LJmwOojvMik/maxresdefault.jpg",
        author: "Every",
        durationLabel: "61 min",
        keyPointCount: 6,
        status: "completed",
        created_at: "2026-08-22T09:00:00.000Z",
    },
    {
        id: "local-demo-a16z",
        video_url: "https://www.youtube.com/watch?v=0t3TpJXa5-A",
        video_title: "Why the Next Great Founders Will Be Borderless",
        thumbnail_url: "https://i.ytimg.com/vi/0t3TpJXa5-A/maxresdefault.jpg",
        author: "a16z",
        durationLabel: "52 min",
        keyPointCount: 9,
        status: "completed",
        created_at: "2026-08-21T09:00:00.000Z",
    },
    {
        id: "local-demo-deepmind",
        video_url: "https://www.youtube.com/watch?v=fo9WirRIaVs",
        video_title: "Robots working together with Gemini Robotics 2",
        thumbnail_url: "https://i.ytimg.com/vi/fo9WirRIaVs/maxresdefault.jpg",
        author: "Google DeepMind",
        durationLabel: "38 min",
        keyPointCount: 6,
        status: "completed",
        created_at: "2026-08-20T09:00:00.000Z",
    },
    {
        id: "local-demo-tiago",
        video_url: "https://www.youtube.com/watch?v=PwUGO74DYJQ",
        video_title: "Nick Milo Reads My Obsidian Vault Like a Doctor",
        thumbnail_url: "https://i.ytimg.com/vi/PwUGO74DYJQ/maxresdefault.jpg",
        author: "Tiago Forte",
        durationLabel: "47 min",
        keyPointCount: 5,
        status: "completed",
        created_at: "2026-08-19T09:00:00.000Z",
    },
    {
        id: "local-demo-no-priors",
        video_url: "https://www.youtube.com/watch?v=7HXqMepjvy8",
        video_title: "From Restoring Sight to Reimagining the Brain",
        thumbnail_url: "https://i.ytimg.com/vi/7HXqMepjvy8/maxresdefault.jpg",
        author: "No Priors",
        durationLabel: "55 min",
        keyPointCount: 8,
        status: "completed",
        created_at: "2026-08-18T09:00:00.000Z",
    },
    {
        id: "local-demo-anthropic",
        video_url: "https://www.youtube.com/watch?v=iF5IWjOWcA4",
        video_title: "How Icelanders are thinking about AI",
        thumbnail_url: "https://i.ytimg.com/vi/iF5IWjOWcA4/maxresdefault.jpg",
        author: "Anthropic",
        durationLabel: "34 min",
        keyPointCount: 6,
        status: "completed",
        created_at: "2026-08-17T09:00:00.000Z",
    },
    {
        id: "local-demo-yc",
        video_url: "https://www.youtube.com/watch?v=IfoPg2QefF8",
        video_title: "Going In Deep On Data | YC Paper Club",
        thumbnail_url: "https://i.ytimg.com/vi/IfoPg2QefF8/maxresdefault.jpg",
        author: "Y Combinator",
        durationLabel: "49 min",
        keyPointCount: 7,
        status: "completed",
        created_at: "2026-08-16T09:00:00.000Z",
    },
    {
        id: "local-demo-peter-yang",
        video_url: "https://www.youtube.com/watch?v=bdMHQLvtVaQ",
        video_title: "How to Build Better AI Evals with Claude Code in 5 Steps",
        thumbnail_url: "https://i.ytimg.com/vi/bdMHQLvtVaQ/maxresdefault.jpg",
        author: "Peter Yang",
        durationLabel: "42 min",
        keyPointCount: 5,
        status: "completed",
        created_at: "2026-08-15T09:00:00.000Z",
    },
]

export function getDemoFixtureTasks(limit: number) {
    return DEMO_FIXTURE_TASKS.slice(0, limit)
}

function createDemoSummary(task: Task, locale: Locale) {
    if (locale === "zh") {
        return {
            version: 4,
            language: "zh",
            tl_dr: `这是一份《${task.video_title}》的本地演示整理，用来展示用户点进播客后可以直接阅读的内容结构。`,
            overview: "正式环境会在这里展示基于节目原文生成的摘要、关键观点、证据和逐字稿。本地演示不冒充真实节目结论。",
            keypoints: [
                {
                    title: "先读结论，再决定是否深入",
                    detail: "详情页先给出简明摘要和少量关键观点，用户不需要从播放器或逐字稿开始寻找价值。",
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
            overview: "本番環境では、番組の原文に基づく要約、重要ポイント、根拠、文字起こしを表示します。ローカルデモは実際の番組内容を装いません。",
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
        overview: "Production displays a source-grounded summary, key points, evidence, and transcript here. The local demo does not pretend to contain findings from the real episode.",
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
    if (!task) return null

    const summary = createDemoSummary(task, locale)
    return {
        ...task,
        takeaway: summary.tl_dr,
        task_outputs: [
            {
                kind: "summary",
                content: summary,
                status: "completed",
                locale,
                created_at: task.created_at,
            },
        ],
    }
}
