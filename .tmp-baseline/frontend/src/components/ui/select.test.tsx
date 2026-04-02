import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import userEvent from '@testing-library/user-event'

describe('Select Component', () => {
  it('renders with placeholder', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
      </Select>
    )
    expect(screen.getByText('Select an option')).toBeDefined()
  })

  it('shows options when clicked', async () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByRole('combobox')
    await userEvent.click(trigger)
    
    expect(screen.getByText('Option 1')).toBeDefined()
    expect(screen.getByText('Option 2')).toBeDefined()
  })

  it('handles value change correctly', async () => {
    const onValueChange = vi.fn()
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    )
    
    const trigger = screen.getByRole('combobox')
    await userEvent.click(trigger)
    
    const option1 = screen.getByText('Option 1')
    await userEvent.click(option1)
    
    expect(onValueChange).toHaveBeenCalledWith('option1')
  })
})
