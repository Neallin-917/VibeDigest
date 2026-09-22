import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskContentDisclosure } from './TaskContentDisclosure'

const labels = { moreLabel: 'Show more', lessLabel: 'Show less' }
let contentHeight = 48
let notifyResize: () => void

function renderContent() {
  return render(
    <TaskContentDisclosure maxLines={4} {...labels}>
      <p>Episode summary</p>
    </TaskContentDisclosure>
  )
}

function clippingContainer() {
  return screen.getByText('Episode summary').parentElement!.parentElement!
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
      Object.defineProperty(style, 'lineHeight', { value: '24px', configurable: true })
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

  it('leaves all content available in server-rendered markup', () => {
    const html = renderToStaticMarkup(
      <TaskContentDisclosure maxLines={4} {...labels}>
        <p>Episode summary</p>
      </TaskContentDisclosure>
    )
    expect(html).toContain('Episode summary')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('max-height:96px')
  })

  it.each([48, 96, 97])('shows %s px of content without a redundant disclosure', (height) => {
    contentHeight = height
    renderContent()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(clippingContainer().style.maxHeight).not.toBe('96px')
  })

  it('collapses content only beyond the height threshold and supports both toggles', () => {
    contentHeight = 98
    renderContent()
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveAttribute('aria-expanded', 'false')
    expect(clippingContainer()).toHaveStyle({ maxHeight: '96px' })

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    expect(clippingContainer().style.maxHeight).not.toBe('96px')

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveAttribute('aria-expanded', 'false')
    expect(clippingContainer()).toHaveStyle({ maxHeight: '96px' })
  })

  it('adds or removes the disclosure when wrapping changes the measured height', () => {
    renderContent()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    resizeTo(144)
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    resizeTo(72)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(clippingContainer().style.maxHeight).not.toBe('96px')
  })

  it('preserves the reader expansion choice across shrink and grow', () => {
    contentHeight = 144
    renderContent()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    resizeTo(48)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    resizeTo(192)
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    expect(clippingContainer().style.maxHeight).not.toBe('96px')
  })

  it('expands when keyboard focus enters the content so links remain visible', () => {
    contentHeight = 144
    render(
      <TaskContentDisclosure maxLines={4} {...labels}>
        <p>Episode summary</p>
        <a href="https://example.com/episode">Original episode</a>
      </TaskContentDisclosure>
    )
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    act(() => screen.getByRole('link', { name: 'Original episode' }).focus())
    expect(screen.getByRole('link', { name: 'Original episode' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    expect(clippingContainer().style.maxHeight).not.toBe('96px')
  })
})
