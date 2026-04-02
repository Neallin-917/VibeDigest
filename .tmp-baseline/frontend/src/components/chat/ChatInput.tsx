'use client'

import { useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { TypewriterPlaceholder } from './TypewriterPlaceholder'

interface ChatInputProps {
  onSubmit: (text: string) => void
  onStop?: () => void
  isLoading?: boolean
  error?: string
  disabled?: boolean
  /** Show typewriter animation in placeholder */
  showTypewriter?: boolean
  /** 
   * Layout variant:
   * - "floating": Absolute positioned at bottom (default, for chat mode)
   * - "inline": Normal block element (for welcome screen)
   */
  variant?: "floating" | "inline"
  /** Hide disclaimer text */
  hideDisclaimer?: boolean
}

export function ChatInput({ 
  onSubmit, 
  onStop,
  isLoading, 
  disabled, 
  showTypewriter = false,
  variant = "floating",
  hideDisclaimer = false
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const { t } = useI18n()

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading || disabled) return
    onSubmit(input)
    setInput('')
  }
  
  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault()
    onStop?.()
  }

  // Show typewriter only when: enabled, no input, and not focused
  const showTypewriterPlaceholder = showTypewriter && !input && !isFocused

  const isFloating = variant === "floating"
  const isStopMode = isLoading && !!onStop

  return (
    <div className={cn(
      "flex justify-center",
      isFloating 
        ? "absolute bottom-3 md:bottom-6 left-3 md:left-6 right-3 md:right-6 z-20" 
        : "w-full"
    )}>
      <div className={cn("w-full", isFloating ? "max-w-3xl" : "max-w-2xl")}>
        <motion.form
          onSubmit={handleSubmit}
          className={cn(
            "relative rounded-[2rem] p-2 pl-6 flex items-center gap-3 ring-1 transition-all duration-300",
            // Premium Glassmorphism
            "bg-white/60 backdrop-blur-2xl ring-white/50 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)]", 
            "dark:bg-zinc-900/60 dark:ring-white/10 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)]",
            
            // Focus State - Soft Glow
            isFocused && "ring-emerald-500/30 shadow-[0_0_0_4px_rgba(16,185,129,0.1)] dark:ring-emerald-500/20 dark:shadow-[0_0_0_4px_rgba(16,185,129,0.05)]"
          )}
        >
          {/* Input container with typewriter overlay */}
          <div className="relative flex-1 min-w-0">
            {/* Typewriter placeholder overlay */}
            <TypewriterPlaceholder visible={showTypewriterPlaceholder} />
            
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              aria-label="Chat input"
              data-testid="chat-input"
              className={cn(
                "w-full bg-transparent border-none focus:ring-0 focus:outline-none text-slate-800 dark:text-zinc-100",
                "py-3.5 text-[15px] font-medium tracking-wide",
                // Hide native placeholder when typewriter is active
                showTypewriterPlaceholder ? "placeholder-transparent" : "placeholder-slate-400/80 dark:placeholder-zinc-500"
              )}
              placeholder={showTypewriter ? "" : (t('chat.inputPlaceholder') || "Ask anything or paste a URL...")}
              disabled={disabled}
            />
          </div>

          <motion.button
            type={isStopMode ? "button" : "submit"}
            onClick={isStopMode ? handleStop : undefined}
            disabled={(!input.trim() && !isStopMode) || (isLoading && !isStopMode) || (disabled && !isStopMode)}
            className={cn(
              "p-2.5 rounded-[1.2rem] shadow-sm transition-all duration-300 active:scale-95 shrink-0 mr-1",
              isStopMode
                ? "bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600"
                : (input.trim() && !isLoading && !disabled
                  ? "bg-gradient-to-tr from-emerald-600 to-emerald-500 hover:to-emerald-400 text-white shadow-emerald-200/50 dark:shadow-none"
                  : "bg-slate-200/50 dark:bg-zinc-800/50 text-slate-400 dark:text-zinc-600 cursor-not-allowed shadow-none")
            )}
            aria-label={isStopMode ? "Stop generation" : "Send message"}
            whileHover={{ scale: (input.trim() || isStopMode) && (!isLoading || isStopMode) && !disabled ? 1.05 : 1 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              animate={{ 
                y: (input.trim() || isStopMode) && (!isLoading || isStopMode) && !disabled ? [0, -2, 0] : 0 
              }}
              transition={{ 
                duration: 0.5, 
                repeat: (input.trim() || isStopMode) && (!isLoading || isStopMode) && !disabled ? Infinity : 0,
                repeatType: "reverse"
              }}
            >
              {isStopMode ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
              )}
            </motion.div>
          </motion.button>
        </motion.form>

        {/* Disclaimer - hidden on mobile for more space */}
        {!hideDisclaimer && (
          <div className="hidden md:block text-center mt-3">
            <p className="text-[11px] text-slate-400/80 dark:text-zinc-500 font-medium tracking-wide">
              AI can make mistakes. Please verify important information.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
