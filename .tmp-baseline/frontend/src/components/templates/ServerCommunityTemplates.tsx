import { createClient } from "@/lib/supabase/server"
import { CommunityTemplates, Task } from "./CommunityTemplates"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const toTask = (value: unknown): Task | null => {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.video_url !== "string" ||
    typeof value.status !== "string" ||
    typeof value.created_at !== "string"
  ) {
    return null
  }

  return {
    id: value.id,
    video_url: value.video_url,
    status: value.status,
    created_at: value.created_at,
    video_title: typeof value.video_title === "string" ? value.video_title : undefined,
    thumbnail_url: typeof value.thumbnail_url === "string" ? value.thumbnail_url : undefined,
    author: typeof value.author === "string" ? value.author : undefined,
    author_image_url: typeof value.author_image_url === "string" ? value.author_image_url : undefined,
  }
}

export async function ServerCommunityTemplates({ limit = 8, showHeader = true }: { limit?: number, showHeader?: boolean }) {
  const supabase = await createClient()

  // Artificial delay for testing (Uncomment to test Skeleton)
  // await new Promise(resolve => setTimeout(resolve, 3000))

  const { data } = await supabase
    .from('tasks')
    .select(`
      id,
      video_url,
      video_title,
      thumbnail_url,
      status,
      created_at,
      author,
      author_image_url
    `)
    .eq('is_demo', true)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit)

  // Transform data to match Task interface
  const initialTasks = (data || [])
    .map(toTask)
    .filter((task): task is Task => Boolean(task))

  return <CommunityTemplates limit={limit} showHeader={showHeader} initialTasks={initialTasks} />
}
