/**
 * Example video/podcast URLs for the typewriter placeholder effect
 * These rotate in the input field to show supported platforms
 */
export const EXAMPLE_URLS = [
  "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.bilibili.com/video/BV1GJ411x7h7",
  "https://podcasts.apple.com/podcast/id1583",
  "https://www.xiaoyuzhoufm.com/episode/abc123",
] as const

/**
 * Typewriter animation configuration
 */
export const TYPEWRITER_CONFIG = {
  /** Milliseconds per character when typing */
  typingSpeed: 70,
  /** Milliseconds per character when deleting */
  deletingSpeed: 30,
  /** Pause duration after typing completes (ms) */
  pauseAfterTyping: 2500,
  /** Pause duration after deleting completes (ms) */
  pauseAfterDeleting: 500,
} as const

/**
 * Load More pagination configuration
 */
export const PAGINATION_CONFIG = {
  /** Number of example cards to show initially */
  initialCount: 8,
  /** Number of cards to load on "Load More" */
  loadMoreCount: 8,
} as const
