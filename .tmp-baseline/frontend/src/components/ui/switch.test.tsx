import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Switch } from './switch'
import userEvent from '@testing-library/user-event'

describe('Switch Component', () => {
  it('renders correctly', () => {
    render(<Switch />)
    expect(screen.getByRole('switch')).toBeDefined()
  })

  it('toggles when clicked', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch onCheckedChange={onCheckedChange} />)
    const switchElement = screen.getByRole('switch')
    
    await userEvent.click(switchElement)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    
    await userEvent.click(switchElement)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('is disabled when the disabled prop is true', () => {
    render(<Switch disabled />)
    const switchElement = screen.getByRole('switch')
    expect(switchElement).toBeDisabled()
  })

  it('reflects checked state correctly', () => {
    const { rerender } = render(<Switch checked={true} />)
    let switchElement = screen.getByRole('switch')
    expect(switchElement.getAttribute('data-state')).toBe('checked')
    
    rerender(<Switch checked={false} />)
    switchElement = screen.getByRole('switch')
    expect(switchElement.getAttribute('data-state')).toBe('unchecked')
  })
})
