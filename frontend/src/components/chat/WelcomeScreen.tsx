'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { createClient } from '@/lib/supabase'
import { QuickTemplateCard } from './QuickTemplateCard'
import { ChatInput, type ChatSubmitHandler } from './ChatInput'

interface Task {
  id: string
  video_url: string
  video_title?: string
  thumbnail_url?: string
}

interface WelcomeScreenProps {
  onSelectExample: (taskId: string) => void
  /** Handler for input submission */
  onSubmit: ChatSubmitHandler
  /** Loading state for input */
  isLoading?: boolean
  /** Whether the user is authenticated */
  isAuthenticated?: boolean | null
}

const CHAT_EXAMPLE_LIMIT = 4

export function WelcomeScreen({ onSelectExample, onSubmit, isLoading, isAuthenticated = null }: WelcomeScreenProps) {
  const { t } = useI18n()
  const [examples, setExamples] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    let cancelled = false

    async function fetchExamples() {
      try {
        const { data } = await supabase
          .from('tasks')
          .select('id, video_url, video_title, thumbnail_url')
          .eq('is_demo', true)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(CHAT_EXAMPLE_LIMIT)

        if (!cancelled && data) {
          setExamples(data as Task[])
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch examples:', error)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchExamples()

    return () => {
      cancelled = true
    }
  }, [supabase])

  return (
    <div className="flex flex-col items-center justify-start min-h-full px-6 py-8 md:py-12">
      {/* Hero Section */}
      <div className="text-center max-w-lg mb-8">

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-3">
          {t('chat.welcome.title')}
        </h1>

        {/* Subtitle */}
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
          {t('chat.welcome.subtitle')}
        </p>
      </div>

      {/* Inline Chat Input - Centered, part of the content flow */}
      <div className="w-full max-w-3xl mb-10">
        <ChatInput
          variant="inline"
          onSubmit={onSubmit}
          isLoading={isLoading}
          hideDisclaimer={true}
        />
        {isAuthenticated === false && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
            {t('auth.signInToChat')}
          </p>
        )}
      </div>

      {/* Examples Section */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('chat.loadingExamples')}</span>
        </div>
      ) : examples.length > 0 ? (
        <div className="w-full max-w-4xl @container">
          {/* Section Header */}
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className={cn(
              "text-xs font-medium uppercase tracking-wider",
              "text-slate-400 dark:text-slate-500"
            )}>
              {t('chat.welcome.tryExamples')}
            </span>
            <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10" />
          </div>

          {/* Grid Layout */}
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
      ) : null}
    </div>
  )
}
