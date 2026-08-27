'use client'

import { useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

export type ChatSubmitResult = void | boolean
export type ChatSubmitHandler = (
  text: string
) => ChatSubmitResult | Promise<ChatSubmitResult>

interface ChatInputProps {
  onSubmit: ChatSubmitHandler
  onStop?: () => void
  isLoading?: boolean
  error?: string
  disabled?: boolean
  /** Override guidance for contexts that only accept a URL. */
  placeholder?: string
  /** Override the accessible label when the input has a narrower purpose. */
  inputLabel?: string
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
  placeholder,
  inputLabel,
  variant = "floating",
  hideDisclaimer = false
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { t } = useI18n()

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading || isSubmitting || disabled) return

    const submittedInput = input
    setIsSubmitting(true)

    try {
      const accepted = await onSubmit(submittedInput)
      if (accepted !== false) {
        setInput(currentInput =>
          currentInput === submittedInput ? '' : currentInput
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault()
    onStop?.()
  }

  const isFloating = variant === "floating"
  const isStopMode = isLoading && !!onStop
  const isBusy = isLoading || isSubmitting

  return (
    <div className={cn(
      "flex justify-center",
      isFloating 
        ? "absolute bottom-3 md:bottom-6 left-3 md:left-6 right-3 md:right-6 z-20" 
        : "w-full"
    )}>
      <div className={cn("w-full", isFloating ? "max-w-3xl" : "max-w-2xl")}>
        <form
          onSubmit={handleSubmit}
          className={cn(
            "relative rounded-[2rem] p-2 pl-6 flex items-center gap-3 ring-1 transition-all duration-300",
            "bg-card/80 ring-border shadow-[0_8px_40px_-12px_rgba(40,55,44,0.12)]",
            
            // Focus State - Soft Glow
            isFocused && "ring-primary/35 shadow-[0_0_0_4px_rgba(70,108,80,0.1)]"
          )}
        >
          <div className="flex-1 min-w-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              aria-label={inputLabel ?? t('chat.inputLabel')}
              data-testid="chat-input"
              className={cn(
                "w-full border-none bg-transparent text-foreground focus:outline-none focus:ring-0",
                "py-3.5 text-[15px] font-medium tracking-wide",
                "placeholder:text-foreground-subtle"
              )}
              placeholder={placeholder ?? t('chat.inputPlaceholder') ?? "Ask anything or paste a URL..."}
              disabled={disabled}
            />
          </div>

          <button
            type={isStopMode ? "button" : "submit"}
            onClick={isStopMode ? handleStop : undefined}
            disabled={(!input.trim() && !isStopMode) || (isBusy && !isStopMode) || (disabled && !isStopMode)}
            className={cn(
              "p-2.5 rounded-[1.2rem] shadow-sm transition-colors duration-200 active:scale-95 shrink-0 mr-1",
              isStopMode
                ? "bg-foreground text-primary-foreground hover:bg-foreground-soft"
                : (input.trim() && !isLoading && !disabled
                  ? "bg-primary-strong text-primary-foreground shadow-[0_8px_18px_-10px_rgba(54,90,64,0.55)] hover:bg-primary"
                  : "cursor-not-allowed bg-muted/70 text-foreground-subtle shadow-none")
            )}
            aria-label={isStopMode ? t('chat.stopGeneration') : t('chat.sendMessage')}
          >
            <div>
              {isStopMode ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
              )}
            </div>
          </button>
        </form>

        {/* Disclaimer - hidden on mobile for more space */}
        {!hideDisclaimer && (
          <div className="hidden md:block text-center mt-3">
            <p className="text-[11px] font-medium tracking-wide text-foreground-subtle/80">
              {t('chat.disclaimer')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
