import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { SERVER_BACKEND_URL } from '@/lib/backend-url'
import { sanitizeErrorMessage } from '@/lib/safe-error'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/env'
import {
  createTaskDataParts,
  createUserTextMessage,
  type ChatUIMessage,
} from '@/lib/chat-ui'
import {
  deriveThreadTitle,
  restoreArchivedThreadIfNeeded,
  upsertChatState,
} from '../persistence'

type DirectSubmitPayload = {
  threadId?: string
  videoUrl?: string
  originalText?: string
  uiLocale?: string
}

function isMockSubmissionMode() {
  return env.NEXT_PUBLIC_E2E_MOCK === '1' || (
    process.env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_LOCAL_DEMO === '1'
  )
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
  try {
    const body = (await req.json()) as DirectSubmitPayload
    if (!body.videoUrl || !body.originalText || !body.threadId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (isMockSubmissionMode()) {
      const { taskId, messages } = buildDirectSubmitMessages({
        videoUrl: body.videoUrl,
        originalText: body.originalText,
      })

      return NextResponse.json({
        task_id: taskId,
        messages,
      })
    }

    const supabase = await createClient()
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

    const user = authUser
    const backendHeaders = {
      Authorization: `Bearer ${session.access_token}`,
    }

    const restoredThread = await restoreArchivedThreadIfNeeded({
      threadId: body.threadId,
      userId: user.id,
      supabase,
    })

    const formData = new FormData()
    formData.append('video_url', body.videoUrl)
    formData.append('request_text', body.originalText)
    if (body.uiLocale) {
      formData.append('ui_locale', body.uiLocale)
    }

    const res = await fetch(`${SERVER_BACKEND_URL}/api/process-video`, {
      method: 'POST',
      headers: backendHeaders,
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        {
          error: 'Task creation failed',
          code: res.status === 402 ? 'QUOTA_EXCEEDED' : 'TASK_CREATION_FAILED',
          details: sanitizeErrorMessage(errorText || `Backend returned status ${res.status}`),
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

    const shouldSetDerivedTitle =
      !restoredThread?.title || restoredThread.title === 'New Chat'

    await upsertChatState({
      threadId: body.threadId,
      user: { id: user.id, email: user.email },
      supabase,
      messages,
      taskIdToBind: taskId,
      threadTitle: shouldSetDerivedTitle
        ? deriveThreadTitle(body.originalText, body.videoUrl)
        : restoredThread.title,
    })

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
        details: 'Unable to process this video right now.',
      },
      { status: 500 }
    )
  }
}
