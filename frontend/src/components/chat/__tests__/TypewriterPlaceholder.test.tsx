import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { TypewriterPlaceholder } from '../TypewriterPlaceholder'
import { EXAMPLE_URLS } from '@/lib/constants'

describe('TypewriterPlaceholder', () => {
  it('renders deterministic SSR markup for hydration safety', () => {
    const html = renderToString(<TypewriterPlaceholder visible={true} />)

    expect(html).toContain(EXAMPLE_URLS[0])
  })

  it('renders the static fallback text before animation state is available', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener,
      removeEventListener,
    }))

    render(<TypewriterPlaceholder visible={true} />)

    expect(screen.getByText(EXAMPLE_URLS[0])).toBeInTheDocument()
  })

  it('does not render when hidden', () => {
    const { container } = render(<TypewriterPlaceholder visible={false} />)

    expect(container).toBeEmptyDOMElement()
  })
})
