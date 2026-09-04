import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

const authMocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
}))
const loginState = vi.hoisted(() => ({
  nextUrl: '/en/chat',
  locale: 'en' as 'en' | 'zh',
  callbackError: null as string | null,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => {
    const params = new URLSearchParams({ next: loginState.nextUrl })
    if (loginState.callbackError) params.set('error', loginState.callbackError)
    return params
  },
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: authMocks }),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: loginState.locale,
    t: (key: string) => ({
      'auth.handoffReady': 'Your link is saved',
      'auth.handoffMessageReady': 'Your request is saved',
      'auth.continueDigest': 'Continue your digest',
      'auth.handoffDescription': 'Sign in to continue with this source in your account.',
      'auth.handoffMessageDescription': 'Sign in to continue with your saved request in your account.',
      'auth.handoffDetails': 'Saved source and next steps',
      'auth.handoffSource': 'Recognized source',
      'auth.handoffOutputs': 'You’ll get',
      'auth.handoffOutputsValue': 'A summary, key ideas, supporting evidence, and source-grounded follow-up.',
      'auth.handoffNext': 'After sign-in',
      'auth.handoffNextValue': 'The Agent will continue with this exact link inside your account.',
      'auth.welcomeBack': 'Welcome Back',
      'auth.signInToContinue': 'Sign in to continue to VibeDigest',
      'auth.signInWithGoogle': 'Sign in with Google',
      'auth.orWithEmail': 'Or with Email',
      'auth.emailPlaceholder': 'name@example.com',
      'auth.sendMagicLink': 'Send Magic Link',
      'auth.usePassword': 'Sign in with Password',
      'auth.noAccount': "Don't have an account? Sign Up",
      'brand.name': 'VibeDigest',
      'auth.errors.invalidCredentials': {
        en: 'Invalid login credentials',
        zh: '登录凭据无效',
      }[loginState.locale],
      'auth.errors.userAlreadyRegistered': {
        en: 'User already registered',
        zh: '该用户已注册',
      }[loginState.locale],
      'auth.errors.weakPassword': {
        en: 'Password should be at least 6 characters',
        zh: '密码长度至少需要6个字符',
      }[loginState.locale],
      'auth.errors.generic': {
        en: 'An error occurred',
        zh: '发生错误',
      }[loginState.locale],
      'auth.errors.callbackFailed': {
        en: 'Sign-in could not be completed. Please try again.',
        zh: '暂时无法完成登录，请重试。',
      }[loginState.locale],
      'auth.errors.callbackMissingCode': {
        en: 'The sign-in link is incomplete. Please try again.',
        zh: '登录链接不完整，请重试。',
      }[loginState.locale],
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
    loginState.locale = 'en'
    loginState.callbackError = null
    authMocks.signInWithOAuth.mockResolvedValue({ error: null })
    authMocks.signInWithPassword.mockResolvedValue({ error: null })
    authMocks.signInWithOtp.mockResolvedValue({ error: null })
    authMocks.signUp.mockResolvedValue({ data: { session: null }, error: null })
  })

  it('confirms the saved link when a visitor arrives from a chat handoff', async () => {
    const originalUrl = 'https://www.youtube.com/watch?v=test123&list=playlist#t=42'
    localStorage.setItem('vibedigest_pending_message', originalUrl)

    render(<LoginForm />)

    await waitFor(() => {
      expect(screen.getByText('Your link is saved')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Continue your digest' })).toBeInTheDocument()
    expect(screen.queryByText('Sign in to continue with this source in your account.')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign in to continue with your saved request in your account.')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Saved source and next steps' })).toHaveTextContent('YouTube')
    expect(screen.getByRole('link', { name: originalUrl })).toHaveAttribute('href', originalUrl)
    expect(screen.queryByText('A summary, key ideas, supporting evidence, and source-grounded follow-up.')).not.toBeInTheDocument()
    expect(screen.queryByText('The Agent will continue with this exact link inside your account.')).not.toBeInTheDocument()
    expect(localStorage.getItem('vibedigest_pending_message')).toBe(originalUrl)
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
      expect(screen.getByText('Your request is saved')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Continue your digest' })).toBeInTheDocument()
    expect(screen.queryByText('Sign in to continue with your saved request in your account.')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign in to continue with this source in your account.')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Saved source and next steps' })).not.toBeInTheDocument()
  })

  it.each([
    ['en', 'An error occurred'],
    ['zh', '发生错误'],
  ] as const)('uses a localized safe fallback for unknown %s auth errors', async (locale, expected) => {
    loginState.locale = locale
    loginState.nextUrl = `/${locale}/chat`
    authMocks.signInWithOAuth.mockResolvedValue({
      error: { message: 'PRIVATE_TOKEN=do-not-display', code: 'unexpected_provider_failure' },
    })

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText(/PRIVATE_TOKEN/)).not.toBeInTheDocument()
  })

  it.each([
    ['en', 'Invalid login credentials'],
    ['zh', '登录凭据无效'],
  ] as const)('keeps known auth error codes actionable in %s', async (locale, expected) => {
    loginState.locale = locale
    loginState.nextUrl = `/${locale}/chat`
    authMocks.signInWithOAuth.mockResolvedValue({
      error: { message: 'Provider-specific wording', code: 'invalid_credentials' },
    })

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('Provider-specific wording')).not.toBeInTheDocument()
  })

  it.each([
    ['en', 'An error occurred'],
    ['zh', '发生错误'],
  ] as const)('localizes callback errors without rendering the URL value in %s', (locale, expected) => {
    loginState.locale = locale
    loginState.nextUrl = `/${locale}/chat`
    loginState.callbackError = 'PRIVATE_TOKEN=do-not-display'

    render(<LoginForm />)

    expect(screen.getByRole('alert')).toHaveTextContent(expected)
    expect(screen.queryByText(/PRIVATE_TOKEN/)).not.toBeInTheDocument()
  })

  it.each([
    ['en', 'auth_callback_failed', 'Sign-in could not be completed. Please try again.'],
    ['zh', 'auth_callback_failed', '暂时无法完成登录，请重试。'],
    ['en', 'auth_callback_missing_code', 'The sign-in link is incomplete. Please try again.'],
    ['zh', 'auth_callback_missing_code', '登录链接不完整，请重试。'],
  ] as const)('maps stable callback error codes for %s', (locale, callbackError, expected) => {
    loginState.locale = locale
    loginState.nextUrl = `/${locale}/chat`
    loginState.callbackError = callbackError

    render(<LoginForm />)

    expect(screen.getByRole('alert')).toHaveTextContent(expected)
  })
})
