import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  event: z.enum(['visit', 'result_view', 'engaged_read']),
  taskId: z.uuid().optional(),
}).strict().refine(v => v.event === 'visit' ? !v.taskId : !!v.taskId)

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (!['www.vibedigest.io', 'vibedigest.io'].includes(url.hostname)
    || request.headers.get('origin') !== url.origin
    || process.env.VERCEL_ENV === 'preview'
    || process.env.NEXT_PUBLIC_E2E_MOCK === '1') {
    return new Response(null, { status: 403 })
  }
  try {
    const raw = await request.text()
    if (raw.length > 512) return new Response(null, { status: 413 })
    const parsed = bodySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return new Response(null, { status: 400 })
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return new Response(null, { status: 401 })
    const { error: writeError } = await supabase.rpc('record_ops_engagement', {
      p_event: parsed.data.event, p_task_id: parsed.data.taskId ?? null,
    })
    if (writeError) return new Response(null, { status: 503 })
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 400 })
  }
}
