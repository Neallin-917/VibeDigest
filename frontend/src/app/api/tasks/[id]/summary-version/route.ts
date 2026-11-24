import { z } from 'zod'
import { agentBackend, AgentServiceError } from '@/lib/agent/backend'
import { createClient } from '@/lib/supabase/server'

const localeRequest = z.object({ locale: z.enum(['en', 'zh']) }).strict()

/** Prepare a missing interface-language digest for the signed-in task owner. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return new Response(null, { status: 403 })
  }
  const { id } = await context.params
  const body = localeRequest.safeParse(await request.json().catch(() => null))
  if (!z.uuid().safeParse(id).success || !body.success) return new Response(null, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return new Response(null, { status: 401 })
  try {
    const result = await agentBackend<{ status: string }>('/summary-locale', {
      userId: data.user.id, taskId: id, locale: body.data.locale,
    }, request.signal)
    return Response.json({ status: result.status })
  } catch (error) {
    return new Response(null, { status: error instanceof AgentServiceError ? error.status : 503 })
  }
}
