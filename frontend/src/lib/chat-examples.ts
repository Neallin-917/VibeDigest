import { z } from "zod"
import { env } from "@/env"
import type { Locale } from "@/lib/i18n"
import { matchPublicSummaryOutput } from "@/lib/summary-contract"

export const CHAT_EXAMPLE_LIMIT = 4

const chatExampleSchema = z.object({
  id: z.string(),
  video_url: z.string(),
  video_title: z.string().nullish().transform((value) => value ?? undefined),
  thumbnail_url: z.string().nullish().transform((value) => value ?? undefined),
})

export type ChatExample = z.infer<typeof chatExampleSchema>

const chatExamplesSchema = z.array(chatExampleSchema.extend({
  task_outputs: z.array(z.object({
    kind: z.string().nullish(),
    status: z.string().nullish(),
    locale: z.string().nullish(),
    content: z.unknown().optional(),
  })).optional(),
}))
const taskIdSchema = z.string().uuid()

function createDemoTasksEndpoint() {
  return new URL("/rest/v1/tasks", env.NEXT_PUBLIC_SUPABASE_URL)
}

async function fetchDemoTasks(endpoint: URL, locale?: Locale): Promise<ChatExample[]> {
  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      ...(locale ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
    })

    if (!response.ok) {
      console.error(`Failed to fetch chat examples: ${response.status}`)
      return []
    }

    const result = chatExamplesSchema.safeParse(await response.json())
    if (!result.success) {
      console.error("Failed to parse chat examples")
      return []
    }

    return result.data
      .filter(row => !locale || matchPublicSummaryOutput(row.task_outputs ?? [], locale).routeMatches)
      .map(row => chatExampleSchema.parse(row))
  } catch (error) {
    console.error("Failed to fetch chat examples:", error)
    return []
  }
}

export async function getChatExamples(): Promise<ChatExample[]> {
  const endpoint = createDemoTasksEndpoint()
  endpoint.searchParams.set(
    "select",
    "id,video_url,video_title,thumbnail_url,task_outputs!inner(id)"
  )
  endpoint.searchParams.set("is_demo", "eq.true")
  endpoint.searchParams.set("status", "eq.completed")
  endpoint.searchParams.set("publication_status", "eq.published")
  endpoint.searchParams.set("task_outputs.kind", "eq.summary")
  endpoint.searchParams.set("task_outputs.status", "eq.completed")
  endpoint.searchParams.set("order", "created_at.desc")
  endpoint.searchParams.set("limit", String(CHAT_EXAMPLE_LIMIT))

  return fetchDemoTasks(endpoint)
}

/**
 * Resolves a direct `?task=` link only when it belongs to the public demo
 * collection. Private task IDs never enter the unauthenticated chat surface.
 */
export async function getChatExample(taskId: string, locale?: Locale): Promise<ChatExample | null> {
  if (!taskIdSchema.safeParse(taskId).success) {
    return null
  }

  const endpoint = createDemoTasksEndpoint()
  endpoint.searchParams.set(
    "select",
    locale
      ? "id,video_url,video_title,thumbnail_url,task_outputs!inner(kind,status,locale,content)"
      : "id,video_url,video_title,thumbnail_url,task_outputs!inner(id)"
  )
  endpoint.searchParams.set("id", `eq.${taskId}`)
  endpoint.searchParams.set("is_demo", "eq.true")
  endpoint.searchParams.set("status", "eq.completed")
  endpoint.searchParams.set("publication_status", "eq.published")
  endpoint.searchParams.set("task_outputs.kind", "eq.summary")
  endpoint.searchParams.set("task_outputs.status", "eq.completed")
  endpoint.searchParams.set("limit", "1")

  return (await fetchDemoTasks(endpoint, locale))[0] ?? null
}
