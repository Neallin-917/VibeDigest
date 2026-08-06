import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProcessingIndicator } from '../ProcessingIndicator'

vi.mock('thinking-orbs', () => ({
  ThinkingOrb: ({ state, size, theme, ...props }: {
    state: string
    size: number
    theme: string
    'aria-hidden'?: string
  }) => (
    <canvas
      data-testid="thinking-orb"
      data-state={state}
      data-size={size}
      data-theme={theme}
      {...props}
    />
  ),
}))

describe('ProcessingIndicator', () => {
  it('announces its visible label while keeping the canvas decorative', () => {
    render(<ProcessingIndicator label="Thinking..." />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status')).toHaveTextContent('Thinking...')
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'working')
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-size', '20')
    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-theme', 'auto')
  })

  it('uses the larger package-tuned canvas only for detail panels', () => {
    render(<ProcessingIndicator label="Analyzing video..." size="panel" />)

    expect(screen.getByTestId('thinking-orb')).toHaveAttribute('data-size', '64')
  })
})
