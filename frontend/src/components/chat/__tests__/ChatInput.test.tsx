import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatInput } from '../ChatInput'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
        if (key === 'chat.inputPlaceholder') return 'Ask me anything...'
        if (key === 'chat.inputLabel') return 'Chat input'
        if (key === 'chat.sendMessage') return 'Send message'
        if (key === 'chat.stopGeneration') return 'Stop generation'
        return key
    }
  })
}))

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  value: 'visible'
})

describe('ChatInput', () => {
  it('renders input with placeholder', () => {
    render(<ChatInput onSubmit={vi.fn()} />)
    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument()
  })

  it('supports narrower guidance and an accessible label', () => {
    render(
      <ChatInput
        onSubmit={vi.fn()}
        placeholder="Paste a video URL..."
        inputLabel="Video URL"
      />
    )

    expect(screen.getByLabelText('Video URL')).toHaveAttribute(
      'placeholder',
      'Paste a video URL...'
    )
  })

  it('updates input value', () => {
    render(<ChatInput onSubmit={vi.fn()} />)
    const input = screen.getByPlaceholderText('Ask me anything...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Hello' } })
    expect(input.value).toBe('Hello')
  })

  it('clears accepted submissions on button click', async () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    
    const input = screen.getByPlaceholderText('Ask me anything...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    
    const button = screen.getByLabelText('Send message')
    fireEvent.click(button)
    
    expect(onSubmit).toHaveBeenCalledWith('Hello')
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('')
    })
  })

  it('preserves a submission when the handler rejects it', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(<ChatInput onSubmit={onSubmit} />)

    const input = screen.getByPlaceholderText('Ask me anything...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://youtu.be/example' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('https://youtu.be/example')
    })
    expect(input.value).toBe('https://youtu.be/example')
  })

  it('does not clear newer text when an earlier submission finishes', async () => {
    let resolveSubmission!: (accepted: boolean) => void
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveSubmission = resolve
    }))
    render(<ChatInput onSubmit={onSubmit} />)

    const input = screen.getByPlaceholderText('Ask me anything...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'First message' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    fireEvent.change(input, { target: { value: 'Next message' } })

    resolveSubmission(true)

    await waitFor(() => {
      expect(input.value).toBe('Next message')
    })
  })

  it('submits on Enter key', () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    
    const input = screen.getByPlaceholderText('Ask me anything...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.submit(input)
    
    expect(onSubmit).toHaveBeenCalledWith('Hello')
  })

  it('does not submit empty input', () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    
    const button = screen.getByLabelText('Send message')
    fireEvent.click(button)
    
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows stop button when loading and onStop provided', () => {
    const onStop = vi.fn()
    render(<ChatInput onSubmit={vi.fn()} isLoading={true} onStop={onStop} />)
    
    const stopButton = screen.getByLabelText('Stop generation')
    expect(stopButton).toBeInTheDocument()
    
    fireEvent.click(stopButton)
    expect(onStop).toHaveBeenCalled()
  })

  it('keeps static input guidance while focused', () => {
    render(<ChatInput onSubmit={vi.fn()} />)

    const input = screen.getByPlaceholderText('Ask me anything...')
    fireEvent.focus(input)

    expect(input).toHaveAttribute('placeholder', 'Ask me anything...')
    expect(input).toHaveClass('placeholder:text-foreground-subtle')
    expect(input.className).not.toContain('dark:')
  })
})
