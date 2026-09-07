import { describe, expect, it } from 'vitest'
import { authCallbackUrl, localeSwitchHref, safeReturnPath } from './locale-navigation'

describe('localized return navigation', () => {
  it('keeps a nested handoff in the selected language', () => {
    const href = localeSwitchHref('/en/login?next=%2Fen%2Fchat%3Ftask%3Dsource-1%23answer#form', 'zh')
    const url = new URL(href, 'https://vibedigest.io')
    expect(url.pathname).toBe('/zh/login')
    expect(url.searchParams.get('next')).toBe('/zh/chat?task=source-1#answer')
    expect(url.hash).toBe('#form')
  })

  it.each(['en', 'zh', 'ja'] as const)('defaults every %s callback to local chat', (locale) => {
    const callback = new URL(authCallbackUrl('https://vibedigest.io', locale))
    expect(callback.pathname).toBe(`/${locale}/auth/callback`)
    expect(callback.searchParams.get('next')).toBe(`/${locale}/chat`)
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/\n/evil.example'])('rejects unsafe return %s', (next) => {
    expect(safeReturnPath(next)).toBeNull()
    const callback = new URL(authCallbackUrl('https://vibedigest.io', 'zh', next))
    expect(callback.searchParams.get('next')).toBe('/zh/chat')
  })
})
