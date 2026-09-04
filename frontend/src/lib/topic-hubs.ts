import { PODCAST_SOURCES, type PodcastTopic } from "@/lib/podcast-sources"
import type { Locale } from "@/lib/i18n"

export const TOPIC_ROUTE_ORDER: PodcastTopic[] = [
  "agents",
  "ai-coding",
  "product",
  "startups",
  "research",
]

type TopicHubCopy = {
  slug: PodcastTopic
  title: string
  eyebrow: string
  description: string
  shortLabel: string
}

export const TOPIC_HUBS: Record<Locale, Record<PodcastTopic, TopicHubCopy>> = {
  en: {
    agents: {
      slug: "agents",
      shortLabel: "AI Agents",
      eyebrow: "Topic hub",
      title: "AI agent podcast digests",
      description:
        "Read finished digests about AI agents, agent workflows, and real deployment tradeoffs across podcasts and long videos.",
    },
    "ai-coding": {
      slug: "ai-coding",
      shortLabel: "AI Coding",
      eyebrow: "Topic hub",
      title: "AI coding podcast digests",
      description:
        "Browse ready-made digests on AI coding, developer tools, code generation, and practical engineering workflows.",
    },
    product: {
      slug: "product",
      shortLabel: "Product",
      eyebrow: "Topic hub",
      title: "Product podcast digests",
      description:
        "Open concise digests on product strategy, user research, growth, and product decision-making from long-form conversations.",
    },
    startups: {
      slug: "startups",
      shortLabel: "Startups",
      eyebrow: "Topic hub",
      title: "Startup podcast digests",
      description:
        "Read startup-focused digests covering founders, go-to-market, company building, and operator lessons from podcasts.",
    },
    research: {
      slug: "research",
      shortLabel: "Research",
      eyebrow: "Topic hub",
      title: "Research podcast digests",
      description:
        "Explore research digests with summaries, evidence, and grounded takeaways from technical and scientific long-form sources.",
    },
  },
  zh: {
    agents: {
      slug: "agents",
      shortLabel: "AI 智能体",
      eyebrow: "主题内容页",
      title: "AI 智能体播客整理",
      description:
        "聚合 AI 智能体、智能体工作流与真实部署取舍相关的公开整理内容，直接阅读摘要、关键观点和证据。",
    },
    "ai-coding": {
      slug: "ai-coding",
      shortLabel: "AI 编程",
      eyebrow: "主题内容页",
      title: "AI 编程播客整理",
      description:
        "浏览 AI 编程、开发工具、代码生成和工程实践相关的现成整理内容。",
    },
    product: {
      slug: "product",
      shortLabel: "产品",
      eyebrow: "主题内容页",
      title: "产品主题播客整理",
      description:
        "查看围绕产品策略、用户研究、增长与产品决策的长内容整理。",
    },
    startups: {
      slug: "startups",
      shortLabel: "创业",
      eyebrow: "主题内容页",
      title: "创业主题播客整理",
      description:
        "聚合创始人、市场进入策略、公司搭建与运营经验相关的公开整理内容。",
    },
    research: {
      slug: "research",
      shortLabel: "研究",
      eyebrow: "主题内容页",
      title: "研究主题播客整理",
      description:
        "浏览技术与科学长内容的研究向整理，包含摘要、证据和可追溯观点。",
    },
  },
  ja: {
    agents: {
      slug: "agents",
      shortLabel: "AI Agents",
      eyebrow: "トピックハブ",
      title: "AI Agentの整理済みポッドキャスト",
      description:
        "AI Agent、Agent workflow、実運用のトレードオフに関する整理済みダイジェストをまとめて読めます。",
    },
    "ai-coding": {
      slug: "ai-coding",
      shortLabel: "AI Coding",
      eyebrow: "トピックハブ",
      title: "AIコーディングの整理済みポッドキャスト",
      description:
        "AIコーディング、開発ツール、コード生成、実務的な開発フローのダイジェストをまとめて閲覧できます。",
    },
    product: {
      slug: "product",
      shortLabel: "Product",
      eyebrow: "トピックハブ",
      title: "プロダクトの整理済みポッドキャスト",
      description:
        "プロダクト戦略、ユーザーリサーチ、成長、意思決定に関する長尺会話のダイジェストを集約しています。",
    },
    startups: {
      slug: "startups",
      shortLabel: "Startups",
      eyebrow: "トピックハブ",
      title: "スタートアップの整理済みポッドキャスト",
      description:
        "創業者、GTM、会社づくり、オペレーターの学びに関するポッドキャストダイジェストを読めます。",
    },
    research: {
      slug: "research",
      shortLabel: "Research",
      eyebrow: "トピックハブ",
      title: "研究の整理済みポッドキャスト",
      description:
        "技術・科学系の長尺ソースから、要約、根拠、追跡可能な示唆をまとめたダイジェストです。",
    },
  },
}

export function isPodcastTopic(value: string): value is PodcastTopic {
  return TOPIC_ROUTE_ORDER.includes(value as PodcastTopic)
}

export function getTopicSourceIds(topic: PodcastTopic) {
  return PODCAST_SOURCES
    .filter((source) => source.topics.includes(topic))
    .map((source) => source.id)
}

export function getTopicHubCopy(locale: Locale, topic: PodcastTopic) {
  return TOPIC_HUBS[locale][topic]
}
