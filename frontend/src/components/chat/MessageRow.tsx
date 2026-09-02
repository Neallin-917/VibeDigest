'use client'

import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { isDataUIPart, isToolUIPart } from 'ai'
import { cn } from '@/lib/utils'
import { partsAreEqual } from '@/lib/chat-perf-utils'
import { renderToolPart, shouldRenderToolPart } from './renderToolPart'
import { renderDataParts } from './renderDataParts'
import type { ChatUIMessage } from '@/lib/chat-ui'

interface MessageRowProps {
  message: ChatUIMessage
  isStreaming: boolean
  liveTaskIds?: Set<string>
  visibleTaskIds?: Set<string>
  onRetryTask?: (taskId: string) => Promise<boolean>
}

function areTaskIdSetsEqual(prev?: Set<string>, next?: Set<string>) {
  if (prev === next) return true
  if (!prev || !next) return !prev && !next
  if (prev.size !== next.size) return false

  for (const value of prev) {
    if (!next.has(value)) return false
  }

  return true
}

function shouldRenderDataPart(part: ChatUIMessage['parts'][number], visibleTaskIds?: Set<string>) {
  if (!visibleTaskIds || !isDataUIPart(part)) return true
  if (!('data' in part) || typeof part.data !== 'object' || part.data === null) return true

  const taskId = 'taskId' in part.data ? part.data.taskId : null
  return typeof taskId !== 'string' || visibleTaskIds.has(taskId)
}

const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ ...props }) => (
          <div className="group relative my-3 w-full overflow-hidden rounded-lg border border-border-strong bg-foreground text-primary-foreground">
            <div className="p-4 overflow-x-auto custom-scrollbar">
              <pre
                {...props}
                className={cn(
                  'bg-transparent p-0 m-0 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words',
                  props.className
                )}
              />
            </div>
          </div>
        ),
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match && !String(children).includes('\n')
          return (
            <code
              className={cn(
                isInline
                  ? "rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[0.9em] text-primary-strong before:content-[''] after:content-['']"
                  : 'bg-transparent font-mono text-sm',
                className
              )}
              {...props}
            >
              {children}
            </code>
          )
        },
        a: ({ ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary-strong transition-colors hover:text-primary hover:underline"
          />
        ),
        ul: ({ ...props }) => <ul {...props} className="my-2 list-disc pl-4 space-y-1" />,
        ol: ({ ...props }) => <ol {...props} className="my-2 list-decimal pl-4 space-y-1" />,
        li: ({ ...props }) => <li {...props} className="pl-1" />
      }}
    >
      {text}
    </ReactMarkdown>
  )
}, (prev, next) => prev.text === next.text)

function MessageRowComponent({
  message,
  isStreaming,
  liveTaskIds,
  visibleTaskIds,
  onRetryTask,
}: MessageRowProps) {
  if (message.role === 'system') return null

  if (message.role === 'assistant') {
    const hasRenderableParts = (message.parts || []).some((part) => {
      const typedPart = part as {
        type?: string
        text?: string
      }
      if (typedPart.type === 'text') return Boolean(typedPart.text?.trim())
      if (isToolUIPart(part)) return shouldRenderToolPart(part)
      if (isDataUIPart(part)) return shouldRenderDataPart(part, visibleTaskIds)
      return false
    })
    if (!hasRenderableParts) return null
  }

  const conversationParts = message.parts?.filter(
    part => part.type === 'text' || isToolUIPart(part)
  ) ?? []
  const dataParts = message.parts && message.parts.length > 0
    ? renderDataParts(message.parts, liveTaskIds, visibleTaskIds, onRetryTask)
    : null

  return (
    <div
      data-streaming={isStreaming ? 'true' : 'false'}
      className={cn('flex w-full min-w-0 group', message.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
    >
      <div
        className={cn(
          'flex flex-col gap-1 max-w-full min-w-0',
          message.role === 'user' ? 'items-end' : 'items-start'
        )}
      >
        {conversationParts.length > 0 ? (
          <div
            className={cn(
              'px-6 py-5 text-[15.5px] leading-7 relative overflow-hidden min-w-0 backdrop-blur-md',
              message.role === 'user'
                ? 'rounded-[20px] rounded-tr-sm border border-primary/15 bg-accent/75 text-foreground'
                : 'rounded-[20px] rounded-tl-sm border border-border/80 bg-card/75 text-foreground shadow-[var(--shadow-soft)]'
            )}
          >
            <div className="w-full min-w-0">
              {conversationParts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <div
                        key={index}
                        className="prose prose-vibedigest prose-sm max-w-none break-words md:prose-base"
                      >
                        <MarkdownBlock text={part.text} />
                      </div>
                    )
                  }

                  if (isToolUIPart(part)) {
                    return (
                      <div key={index} className="w-full min-w-0 max-w-full">
                        {renderToolPart(part, index)}
                      </div>
                    )
                  }

                  return null
                })}
            </div>
          </div>
        ) : null}
        {dataParts}
      </div>
    </div>
  )
}

export const MessageRow = memo(MessageRowComponent, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false
  if (!areTaskIdSetsEqual(prev.liveTaskIds, next.liveTaskIds)) return false
  if (!areTaskIdSetsEqual(prev.visibleTaskIds, next.visibleTaskIds)) return false
  if (prev.onRetryTask !== next.onRetryTask) return false

  // If streaming, always re-render to show updates
  if (next.isStreaming) return false

  if (prev.message === next.message) return true
  if (prev.message.id !== next.message.id) return false
  if (prev.message.role !== next.message.role) return false

  // Shallow comparison of parts: text by value, tool parts by reference
  // Replaces O(n*size) JSON.stringify with O(n) loop
  return partsAreEqual(prev.message.parts, next.message.parts)
})
