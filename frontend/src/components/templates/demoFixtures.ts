import type { Task } from "./CommunityTemplates"

const DEMO_FIXTURE_TASKS: Task[] = [
    {
        id: "local-demo-feedback-loop",
        video_url: "https://www.youtube.com/watch?v=7rzYDM6vMtI",
        video_title: "How AI shortens the feedback loop",
        thumbnail_url: "https://i.ytimg.com/vi/7rzYDM6vMtI/maxresdefault.jpg",
        author: "VibeDigest demo",
        status: "completed",
        created_at: "2026-01-03T09:00:00.000Z",
    },
    {
        id: "local-demo-ai-strategy",
        video_url: "https://www.youtube.com/watch?v=zgNvts_2TUE",
        video_title: "State of the Claw — Peter Steinberger",
        thumbnail_url: "https://i.ytimg.com/vi_webp/zgNvts_2TUE/maxresdefault.webp",
        author: "Community example",
        status: "completed",
        created_at: "2026-01-02T09:00:00.000Z",
    },
    {
        id: "local-demo-business",
        video_url: "https://www.youtube.com/watch?v=64xjlq_rKW0",
        video_title: "GE Aerospace: Full Throttle",
        thumbnail_url: "https://i.ytimg.com/vi/64xjlq_rKW0/maxresdefault.jpg",
        author: "Business Breakdowns",
        status: "completed",
        created_at: "2026-01-01T09:00:00.000Z",
    },
    {
        id: "local-demo-ai-infrastructure",
        video_url: "https://www.youtube.com/watch?v=NyP-euljCHM",
        video_title: "Inside America’s AI Strategy: Infrastructure, Regulation, and Global Competition",
        thumbnail_url: "https://i.ytimg.com/vi/NyP-euljCHM/maxresdefault.jpg",
        author: "All-In Podcast",
        status: "completed",
        created_at: "2025-12-31T09:00:00.000Z",
    },
]

export function getDemoFixtureTasks(limit: number) {
    return DEMO_FIXTURE_TASKS.slice(0, limit)
}
