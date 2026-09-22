import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskContentDisclosure } from './TaskContentDisclosure'

const labels = { moreLabel: 'Show more', lessLabel: 'Show less' }
const preview = 'A readable episode preview.'
let contentHeight = 48
let notifyResize: () => void

function renderContent() {
  return render(
    <TaskContentDisclosure maxLines={4} preview={preview} {...labels}>
      <p>Episode summary</p>
      <a href="https://example.com/episode">Original episode</a>
    </TaskContentDisclosure>
  )
}

function getDetails(container: HTMLElement) {
  return container.querySelector('details')!
}

function resizeTo(height: number) {
  act(() => {
    contentHeight = height
    notifyResize()
  })
}

describe('TaskContentDisclosure', () => {
  beforeEach(() => {
    contentHeight = 48
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      height: contentHeight,
      width: 400,
      top: 0,
      left: 0,
      bottom: contentHeight,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }))
    const originalGetComputedStyle = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = originalGetComputedStyle(element)
      Object.defineProperty(style, 'lineHeight', {
        value: element.tagName === 'P' ? '28px' : '24px',
        configurable: true,
      })
      return style
    })
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) {
        notifyResize = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('server-renders a closed native disclosure with its preview and full content', () => {
    const html = renderToStaticMarkup(
      <TaskContentDisclosure maxLines={4} preview={preview} {...labels}>
        <p>Episode summary</p>
      </TaskContentDisclosure>
    )
    const document = new DOMParser().parseFromString(html, 'text/html')
    const details = document.querySelector('details')!
    expect(details.hasAttribute('open')).toBe(false)
    expect(details.querySelector('summary')!.hasAttribute('aria-expanded')).toBe(false)
    expect(details.querySelector('summary')!.textContent).toContain(preview)
    expect(details.textContent).toContain('Episode summary')
    expect(html).not.toContain('max-height:')
    expect(html).not.toContain('overflow:hidden')
  })

  it.each([48, 98, 112, 113])('shows %s px of content using actual paragraph line height', (height) => {
    contentHeight = height
    const { container } = renderContent()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(getDetails(container)).toHaveAttribute('open')
    expect(within(getDetails(container)).getByText('Episode summary')).toBeVisible()
  })

  it('collapses beyond the paragraph-height threshold and supports both toggles', () => {
    contentHeight = 114
    const { container } = renderContent()
    const details = getDetails(container)
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(details).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('adds or removes the disclosure when wrapping changes the measured height', () => {
    const { container } = renderContent()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    resizeTo(144)
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(getDetails(container)).not.toHaveAttribute('open')
    resizeTo(72)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(getDetails(container)).toHaveAttribute('open')
  })

  it('preserves the reader expansion choice across shrink and grow', () => {
    contentHeight = 144
    const { container } = renderContent()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    resizeTo(48)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    resizeTo(192)
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    expect(getDetails(container)).toHaveAttribute('open')
  })

  it('uses closed details to hide the body and excludes its measurement copy from interaction', () => {
    contentHeight = 144
    const { container } = renderContent()
    const details = getDetails(container)
    expect(within(details).getByText('Episode summary')).not.toBeVisible()
    expect(within(details).getByText('Original episode')).not.toBeVisible()
    const measurement = container.querySelector('[inert][aria-hidden="true"]')!
    expect(measurement).not.toBeNull()
    expect(measurement).toHaveTextContent('Episode summary')
    expect(measurement.closest('details')).toBeNull()
    expect(container.querySelector('[style*="max-height"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(within(details).getByText('Original episode')).toBeVisible()
  })

  it('bounds the plain-text preview without splitting unicode codepoints', () => {
    contentHeight = 144
    const { container } = render(
      <TaskContentDisclosure maxLines={4} preview={'😀'.repeat(120)} {...labels}>
        <p>Full content remains available</p>
      </TaskContentDisclosure>
    )
    const summary = getDetails(container).querySelector('summary')!
    const text = summary.firstElementChild!.textContent!
    expect(text).toContain('…')
    expect(Array.from(text)).toHaveLength(97)
    expect(text).toBe(`${'😀'.repeat(96)}…`)
    expect(text).not.toContain('\uFFFD')
  })
})
