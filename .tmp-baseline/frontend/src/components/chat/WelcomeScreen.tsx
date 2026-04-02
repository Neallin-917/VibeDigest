'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { createClient } from '@/lib/supabase'
import { QuickTemplateCard } from './QuickTemplateCard'
import { ChatInput } from './ChatInput'
import { PAGINATION_CONFIG } from '@/lib/constants'

interface Task {
  id: string
  video_url: string
  video_title?: string
  thumbnail_url?: string
}

interface WelcomeScreenProps {
  onSelectExample: (taskId: string) => void
  /** Handler for input submission */
  onSubmit: (text: string) => void
  /** Loading state for input */
  isLoading?: boolean
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
}

export function WelcomeScreen({ onSelectExample, onSubmit, isLoading, isAuthenticated = false }: WelcomeScreenProps) {
  const { t } = useI18n()
  const [examples, setExamples] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchExamples = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    const limit = offset === 0 ? PAGINATION_CONFIG.initialCount : PAGINATION_CONFIG.loadMoreCount

    try {
      const { data, count } = await supabase
        .from('tasks')
        .select('id, video_url, video_title, thumbnail_url', { count: 'exact' })
        .eq('is_demo', true)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (data) {
        if (append) {
          setExamples(prev => {
            const existingIds = new Set(prev.map(t => t.id))
            const newItems = data.filter(t => !existingIds.has(t.id))
            return [...prev, ...newItems]
          })
        } else {
          setExamples(data)
        }
        // Check if there are more items to load
        const totalLoaded = append ? examples.length + data.length : data.length
        setHasMore(count !== null && totalLoaded < count)
      }
    } catch (error) {
      console.error('Failed to fetch examples:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [supabase, examples.length])

  const observerTarget = useRef<HTMLDivElement>(null)

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchExamples(examples.length, true)
    }
  }, [loadingMore, hasMore, fetchExamples, examples.length])

  useEffect(() => {
    fetchExamples(0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          handleLoadMore()
        }
      },
      { threshold: 0.5 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, handleLoadMore])

  return (
    <div className="flex flex-col items-center justify-start min-h-full px-6 py-8 md:py-12">
      {/* Hero Section */}
      <div className="text-center max-w-lg mb-8">

        {/* Title */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-3"
        >
          {t('chat.welcome.title')}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-sm md:text-base text-slate-500 dark:text-slate-400 leading-relaxed"
        >
          {t('chat.welcome.subtitle')}
        </motion.p>
      </div>

      {/* Inline Chat Input - Centered, part of the content flow */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="w-full max-w-3xl mb-10"
      >
        <ChatInput
          variant="inline"
          onSubmit={onSubmit}
          isLoading={isLoading}
          showTypewriter={true}
          hideDisclaimer={true}
        />
        {!isAuthenticated && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
            {t('auth.signInToChat')}
          </p>
        )}
      </motion.div>

      {/* Examples Section */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading examples...</span>
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
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4"
          >
            {examples.map((task, idx) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.5 + idx * 0.05 }}
                whileHover={{ scale: 1.05, y: -2 }}
              >
                <QuickTemplateCard
                  task={task}
                  onSelect={onSelectExample}
                />
              </motion.div>
            ))}
          </motion.div>

          {/* Load More Trigger */}
          {hasMore && (
            <div ref={observerTarget} className="flex justify-center mt-8 py-4 opacity-0">
              {/* Invisible trigger for infinite scroll */}
              <div className="h-4 w-4" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
