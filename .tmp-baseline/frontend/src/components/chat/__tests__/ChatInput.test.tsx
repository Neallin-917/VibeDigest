import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInput } from '../ChatInput'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
        if (key === 'chat.inputPlaceholder') return 'Ask me anything...'
        return key
    }
  })
}))

vi.mock('../TypewriterPlaceholder', () => ({
  TypewriterPlaceholder: ({ visible }: any) => visible ? <div data-testid="typewriter">Typewriter</div> : null
}))

describe('ChatInput', () => {
  it('renders input with placeholder', () => {
    render(<ChatInput onSubmit={vi.fn()} />)
    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument()
  })

  it('updates input value', () => {
    render(<ChatInput onSubmit={vi.fn()} />)
    const input = screen.getByPlaceholderText('Ask me anything...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Hello' } })
    expect(input.value).toBe('Hello')
  })

  it('submits on button click', () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    
    const input = screen.getByPlaceholderText('Ask me anything...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    
    const button = screen.getByLabelText('Send message')
    fireEvent.click(button)
    
    expect(onSubmit).toHaveBeenCalledWith('Hello')
    expect((input as HTMLInputElement).value).toBe('')
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

  it('shows typewriter placeholder when enabled and empty', () => {
    render(<ChatInput onSubmit={vi.fn()} showTypewriter={true} />)
    expect(screen.getByTestId('typewriter')).toBeInTheDocument()
    
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    expect(screen.queryByTestId('typewriter')).not.toBeInTheDocument()
    
    fireEvent.blur(input)
    expect(screen.getByTestId('typewriter')).toBeInTheDocument()
    
    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.queryByTestId('typewriter')).not.toBeInTheDocument()
  })
})
