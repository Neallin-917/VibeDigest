import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

const authMocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
}))
const loginState = vi.hoisted(() => ({ nextUrl: '/en/chat' }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ next: loginState.nextUrl }),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: authMocks }),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => ({
      'auth.handoffReady': 'Your link is saved',
      'auth.continueDigest': 'Continue your digest',
      'auth.handoffDescription': 'Sign in and we’ll start processing it right away.',
      'auth.welcomeBack': 'Welcome Back',
      'auth.signInToContinue': 'Sign in to continue to VibeDigest',
      'auth.signInWithGoogle': 'Sign in with Google',
      'auth.orWithEmail': 'Or with Email',
      'auth.emailPlaceholder': 'name@example.com',
      'auth.sendMagicLink': 'Send Magic Link',
      'auth.usePassword': 'Sign in with Password',
      'auth.noAccount': "Don't have an account? Sign Up",
      'brand.name': 'VibeDigest',
    })[key] ?? key,
  }),
}))

vi.mock('@/components/i18n/LanguageInlineSelect', () => ({
  LanguageInlineSelect: () => null,
}))

describe('LoginForm', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    loginState.nextUrl = '/en/chat'
  })

  it('confirms the saved link when a visitor arrives from a chat handoff', async () => {
    localStorage.setItem('vibedigest_pending_message', 'https://www.youtube.com/watch?v=test123')

    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByText('Your link is saved')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Continue your digest' })).toBeInTheDocument()
    expect(screen.getByText('Sign in and we’ll start processing it right away.')).toBeInTheDocument()
  })

  it('keeps the usual sign-in framing for a direct login', async () => {
    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument()
    })
    expect(screen.queryByText('Your link is saved')).not.toBeInTheDocument()
  })

  it('keeps the handoff confirmation when the chat source is retained in next', async () => {
    loginState.nextUrl = '/en/chat?task=public-demo'
    localStorage.setItem('vibedigest_pending_message', 'What is the main risk?')

    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByText('Your link is saved')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Continue your digest' })).toBeInTheDocument()
  })
})
