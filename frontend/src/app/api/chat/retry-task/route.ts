import { NextResponse } from 'next/server'

import { env } from '@/env'
import { SERVER_BACKEND_URL } from '@/lib/backend-url'
import { sanitizeErrorMessage } from '@/lib/safe-error'
import { createClient } from '@/lib/supabase/server'

type RetryTaskPayload = {
  taskId?: string
}

function isMockSubmissionMode() {
  return env.NEXT_PUBLIC_E2E_MOCK === '1' || (
    process.env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_LOCAL_DEMO === '1'
  )
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RetryTaskPayload
    if (!body.taskId) {
      return NextResponse.json({ error: 'Missing task id' }, { status: 400 })
    }

    if (isMockSubmissionMode()) {
      return NextResponse.json({ message: 'Task retry queued' })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!user || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = new FormData()
    formData.append('task_id', body.taskId)
    const response = await fetch(`${SERVER_BACKEND_URL}/api/retry-task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          error: 'Task retry failed',
          details: sanitizeErrorMessage(errorText || `Backend returned status ${response.status}`),
        },
        { status: response.status }
      )
    }

    return NextResponse.json({ message: 'Task retry queued' })
  } catch (error) {
    console.error('[API/Chat] Task retry failed:', error)
    return NextResponse.json(
      {
        error: 'Task retry failed',
        details: 'Unable to process this video right now.',
      },
      { status: 500 }
    )
  }
}
