import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Radix UI portals require PointerEvent support in jsdom
if (!window.PointerEvent) {
    class PointerEvent extends MouseEvent {
        constructor(type: string, params?: PointerEventInit) {
            super(type, params)
        }
    }
    // @ts-expect-error - polyfill for jsdom
    window.PointerEvent = PointerEvent
}
window.HTMLElement.prototype.hasPointerCapture ??= vi.fn()
window.HTMLElement.prototype.scrollIntoView ??= vi.fn()

// Mock Environment Variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'example-key'

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString()
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key]
        }),
        clear: vi.fn(() => {
            store = {}
        }),
        key: vi.fn((index: number) => Object.keys(store)[index] || null),
        get length() {
            return Object.keys(store).length
        }
    }
})()

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
})
