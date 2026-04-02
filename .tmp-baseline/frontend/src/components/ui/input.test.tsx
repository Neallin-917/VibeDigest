import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Input } from './input'
import userEvent from '@testing-library/user-event'

describe('Input Component', () => {
  it('renders correctly', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeDefined()
  })

  it('handles user input correctly', async () => {
    const user = userEvent.setup()
    render(<Input placeholder="Type here" />)
    const input = screen.getByPlaceholderText('Type here')
    
    await user.type(input, 'Hello World')
    expect(input).toHaveValue('Hello World')
  })

  it('applies custom className', () => {
    render(<Input className="custom-class" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('custom-class')
  })

  it('disables the input when disabled prop is true', () => {
    render(<Input disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

  it('handles focus and blur events', async () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(<Input onFocus={onFocus} onBlur={onBlur} />)
    
    const input = screen.getByRole('textbox')
    await userEvent.click(input)
    expect(onFocus).toHaveBeenCalled()
    
    await userEvent.tab()
    expect(onBlur).toHaveBeenCalled()
  })
})
