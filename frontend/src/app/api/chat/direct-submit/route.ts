import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { BACKEND_API_URL } from '@/lib/backend-url'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/env'
import {
  createTaskDataParts,
  createUserTextMessage,
  type ChatUIMessage,
} from '@/lib/chat-ui'
import { upsertChatState } from '../persistence'

const E2E_MOCK_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'tester@vibedigest.io',
} as const

type DirectSubmitPayload = {
  threadId?: string
  videoUrl?: string
  originalText?: string
}

function buildDirectSubmitMessages(params: {
  taskId?: string
  videoUrl: string
  originalText: string
}) {
  const taskId = params.taskId ?? `task-${uuidv4()}`
  const userMessage = createUserTextMessage(`direct-user-${uuidv4()}`, params.originalText)
  const assistantMessage = createTaskDataParts({
    messageId: `direct-assistant-${uuidv4()}`,
    taskId,
    status: 'pending',
    progress: 0,
    videoUrl: params.videoUrl,
  })

  return {
    taskId,
    messages: [userMessage, assistantMessage] satisfies ChatUIMessage[],
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  let user: { id: string; email?: string } | null = null
  let accessToken: string | undefined
  let backendHeaders: Record<string, string> = {}

  if (env.NEXT_PUBLIC_E2E_MOCK === '1') {
    user = E2E_MOCK_USER
    backendHeaders = {
      'X-Guest-Id': 'e2e-guest-user',
    }
  } else {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Session invalid' }, { status: 401 })
    }

    user = authUser
    accessToken = session.access_token
    backendHeaders = {
      Authorization: `Bearer ${accessToken}`,
    }
  }

    try {
        const body = (await req.json()) as DirectSubmitPayload
        if (!body.videoUrl || !body.originalText || !body.threadId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

    if (env.NEXT_PUBLIC_E2E_MOCK === '1') {
      const { taskId, messages } = buildDirectSubmitMessages({
        videoUrl: body.videoUrl,
        originalText: body.originalText,
      })

      return NextResponse.json({
        task_id: taskId,
        messages,
      })
    }

    const formData = new FormData()
    formData.append('video_url', body.videoUrl)

    const res = await fetch(`${BACKEND_API_URL}/api/process-video`, {
      method: 'POST',
      headers: backendHeaders,
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        {
          error: 'Task creation failed',
          code: 'TASK_CREATION_FAILED',
          details: errorText || `Backend returned status ${res.status}`,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    const taskId = typeof data.task_id === 'string' ? data.task_id : null

    if (!taskId) {
      return NextResponse.json({ error: 'Task creation failed' }, { status: 502 })
    }

    const { messages } = buildDirectSubmitMessages({
      taskId,
      videoUrl: body.videoUrl,
      originalText: body.originalText,
    })

    if (env.NEXT_PUBLIC_E2E_MOCK !== '1') {
      await upsertChatState({
        threadId: body.threadId,
        user: { id: user.id, email: user.email },
        supabase,
        messages,
        taskIdToBind: taskId,
      })
    }

    return NextResponse.json({
      task_id: taskId,
      messages,
    })
  } catch (error) {
    console.error('[API/Chat] Direct submit failed:', error)
    return NextResponse.json(
      {
        error: 'Direct submit failed',
        code: 'DIRECT_SUBMIT_FAILED',
        details: error instanceof Error ? error.message : 'Unexpected error',
      },
      { status: 500 }
    )
  }
}
