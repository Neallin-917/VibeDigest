import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskContentDisclosure } from './TaskContentDisclosure'

const labels = { moreLabel: 'Show more', lessLabel: 'Show less' }
const preview = 'A readable episode preview.'
let contentHeight = 48
let previewHeight = 48
let resizeCallbacks: Map<Element, () => void>

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
    for (const callback of new Set(resizeCallbacks.values())) callback()
  })
}

describe('TaskContentDisclosure', () => {
  beforeEach(() => {
    contentHeight = 48
    previewHeight = 48
    resizeCallbacks = new Map()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = this.firstElementChild?.tagName === 'SPAN' ? previewHeight : contentHeight
      return {
        height,
        width: 400,
        top: 0,
        left: 0,
        bottom: height,
        right: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    })
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
      constructor(private callback: () => void) {}
      observe(element: Element) {
        resizeCallbacks.set(element, this.callback)
      }
      unobserve(element: Element) {
        resizeCallbacks.delete(element)
      }
      disconnect() {
        for (const [element, callback] of resizeCallbacks) {
          if (callback === this.callback) resizeCallbacks.delete(element)
        }
      }
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

  it.each([242, 198, 170, 143])('keeps 198 px of content open when the collapsed preview takes %s px', (height) => {
    contentHeight = 198
    previewHeight = height
    const { container } = renderContent()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(getDetails(container)).toHaveAttribute('open')
    expect(within(getDetails(container)).getByText('Episode summary')).toBeVisible()
  })

  it('collapses when the preview and control together save exactly two paragraph lines', () => {
    contentHeight = 198
    previewHeight = 142
    const { container } = renderContent()
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(getDetails(container)).not.toHaveAttribute('open')
  })

  it('remeasures when only the preview height changes', () => {
    contentHeight = 198
    previewHeight = 142
    const { container } = renderContent()
    const measuredPreview = Array.from(resizeCallbacks.keys()).find(element => element.firstElementChild?.tagName === 'SPAN')
    expect(measuredPreview).toBeDefined()
    expect(getDetails(container)).not.toHaveAttribute('open')

    act(() => {
      previewHeight = 242
      resizeCallbacks.get(measuredPreview!)!()
    })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(getDetails(container)).toHaveAttribute('open')

    act(() => {
      previewHeight = 142
      resizeCallbacks.get(measuredPreview!)!()
    })
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(getDetails(container)).not.toHaveAttribute('open')
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
