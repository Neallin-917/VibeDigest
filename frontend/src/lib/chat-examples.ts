import { z } from "zod"
import { env } from "@/env"

export const CHAT_EXAMPLE_LIMIT = 4

const chatExampleSchema = z.object({
  id: z.string(),
  video_url: z.string(),
  video_title: z.string().nullish().transform((value) => value ?? undefined),
  thumbnail_url: z.string().nullish().transform((value) => value ?? undefined),
})

export type ChatExample = z.infer<typeof chatExampleSchema>

const chatExamplesSchema = z.array(chatExampleSchema)

export async function getChatExamples(): Promise<ChatExample[]> {
  const endpoint = new URL("/rest/v1/tasks", env.NEXT_PUBLIC_SUPABASE_URL)
  endpoint.searchParams.set("select", "id,video_url,video_title,thumbnail_url")
  endpoint.searchParams.set("is_demo", "eq.true")
  endpoint.searchParams.set("status", "eq.completed")
  endpoint.searchParams.set("order", "created_at.desc")
  endpoint.searchParams.set("limit", String(CHAT_EXAMPLE_LIMIT))

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      next: {
        revalidate: 300,
      },
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
  } catch (error) {
    console.error("Failed to fetch chat examples:", error)
    return []
  }
}
