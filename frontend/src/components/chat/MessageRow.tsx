'use client'

import React, { memo } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getToolName, isToolUIPart } from 'ai'
import { cn } from '@/lib/utils'
import { partsAreEqual } from '@/lib/chat-perf-utils'
import { renderToolPart } from './renderToolPart'
import type { ChatUIMessage } from '@/lib/chat-ui'

interface MessageRowProps {
  message: ChatUIMessage
  isStreaming: boolean
  enableMotion: boolean
  onOpenPanel?: (taskId: string) => void
}

const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ ...props }) => (
          <div className="overflow-hidden w-full my-3 bg-slate-950 dark:bg-black/40 rounded-lg border border-slate-200 dark:border-white/10 group relative">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 dark:bg-white/5 border-b border-slate-800 dark:border-white/5">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
              </div>
            </div>
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
                  ? "bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono text-[0.9em] before:content-[''] after:content-[''] text-emerald-700 dark:text-emerald-300"
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
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 hover:underline transition-colors font-medium"
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

function MessageRowComponent({ message, isStreaming, enableMotion, onOpenPanel }: MessageRowProps) {
  if (message.role === 'system') return null

  if (message.role === 'assistant') {
    const hasRenderableParts = (message.parts || []).some((part) => {
      const typedPart = part as {
        type?: string
        text?: string
        output?: { taskId?: string }
      }
      if (typedPart.type === 'text') return Boolean(typedPart.text?.trim())
      if (isToolUIPart(part)) {
        const toolName = getToolName(part)
        if (toolName === 'preview_video') return false
        if (toolName === 'create_task' && !typedPart.output?.taskId) return false
        return true
      }
      return false
    })
    if (!hasRenderableParts) return null
  }

  const toolParts = (message.parts || []).filter(
    part => isToolUIPart(part)
  )
  const hasGetTaskStatus = toolParts.some((p) => {
    return getToolName(p) === 'get_task_status'
  })
  const hasGetTaskOutputs = toolParts.some((p) => {
    return getToolName(p) === 'get_task_outputs'
  })
  const suppressAssistantText = message.role === 'assistant' && hasGetTaskStatus && !hasGetTaskOutputs

  const Wrapper: React.ElementType = enableMotion ? motion.div : 'div'
  const wrapperProps = enableMotion
    ? {
        initial: { opacity: 0, y: 15 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: 'easeOut' }
      }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      data-streaming={isStreaming ? 'true' : 'false'}
      className={cn('flex w-full min-w-0 group', message.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
    >
      <div
        className={cn(
          'flex flex-col gap-1 max-w-full min-w-0',
          message.role === 'user' ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'px-6 py-5 text-[15.5px] leading-7 relative overflow-hidden min-w-0 backdrop-blur-md',
            message.role === 'user'
              ? 'rounded-[20px] rounded-tr-sm bg-emerald-600/10 dark:bg-emerald-500/10 border border-emerald-600/10 dark:border-emerald-500/20 text-slate-800 dark:text-zinc-200'
              : 'rounded-[20px] rounded-tl-sm bg-white/60 dark:bg-zinc-900/60 border border-white/50 dark:border-white/10 text-slate-800 dark:text-zinc-200 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)]'
          )}
        >
          <div className="w-full min-w-0">
            {message.parts && message.parts.length > 0
              ? message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    if (suppressAssistantText) return null
                    return (
                      <div
                        key={index}
                        className="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none break-words"
                      >
                        <MarkdownBlock text={part.text} />
                      </div>
                    )
                  }

                  if (isToolUIPart(part)) {
                    return (
                      <div key={index} className="w-full min-w-0 max-w-full">
                        {renderToolPart(part, index, onOpenPanel, { hasGetTaskStatus })}
                      </div>
                    )
                  }

                  return null
                })
              : null}
          </div>
        </div>
      </div>
    </Wrapper>
  )
}

export const MessageRow = memo(MessageRowComponent, (prev, next) => {
  if (prev.enableMotion !== next.enableMotion) return false
  if (prev.isStreaming !== next.isStreaming) return false
  if (prev.onOpenPanel !== next.onOpenPanel) return false

  // If streaming, always re-render to show updates
  if (next.isStreaming) return false

  if (prev.message === next.message) return true
  if (prev.message.id !== next.message.id) return false
  if (prev.message.role !== next.message.role) return false

  // Shallow comparison of parts: text by value, tool parts by reference
  // Replaces O(n*size) JSON.stringify with O(n) loop
  return partsAreEqual(prev.message.parts, next.message.parts)
})
