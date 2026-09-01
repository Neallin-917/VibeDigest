'use client'

import { Suspense, use } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { ChatExample } from '@/lib/chat-examples'
import { QuickTemplateCard } from './QuickTemplateCard'
import { ChatInput, type ChatSubmitHandler } from './ChatInput'

interface WelcomeScreenProps {
  onSelectExample: (task: ChatExample) => void
  /** Handler for input submission */
  onSubmit: ChatSubmitHandler
  /** Loading state for input */
  isLoading?: boolean
  /** Whether the user is authenticated */
  isAuthenticated?: boolean | null
  /** Server-started examples request, streamed without blocking the input */
  initialExamples?: Promise<ChatExample[]> | null
}

function ExamplesLoading() {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-2 text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{t('chat.loadingExamples')}</span>
    </div>
  )
}

function WelcomeExamples({
  examplesPromise,
  onSelectExample,
}: {
  examplesPromise: Promise<ChatExample[]>
  onSelectExample: (task: ChatExample) => void
}) {
  const { t } = useI18n()
  const examples = use(examplesPromise)

  if (examples.length === 0) return null

  return (
    <div className="w-full max-w-4xl @container">
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className={cn(
          "text-xs font-medium uppercase tracking-wider",
          "text-slate-400 dark:text-slate-500"
        )}>
          {t('chat.welcome.tryExamples')}
        </span>
        <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {examples.map((task, index) => (
          <div key={task.id}>
            <QuickTemplateCard
              task={task}
              onSelect={onSelectExample}
              highPriorityThumbnail={index === 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function WelcomeScreen({
  onSelectExample,
  onSubmit,
  isLoading,
  initialExamples = null,
}: WelcomeScreenProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center justify-start min-h-full px-6 py-8 md:py-12">
      <div className="w-full text-center max-w-lg mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-3">
          {t('chat.welcome.title')}
        </h1>
      </div>

      {/* Inline Chat Input - Centered, part of the content flow */}
      <div className="w-full max-w-3xl mb-10">
        <ChatInput
          variant="inline"
          onSubmit={onSubmit}
          isLoading={isLoading}
          hideDisclaimer={true}
        />
      </div>

      {initialExamples ? (
        <Suspense fallback={<ExamplesLoading />}>
          <WelcomeExamples
            examplesPromise={initialExamples}
            onSelectExample={onSelectExample}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
