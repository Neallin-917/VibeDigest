import { describe, expect, it } from 'vitest'

import {
  buildDetailedSummaryMarkdownFromContent,
  buildSummaryExcerptFromContent,
  buildSummaryMarkdownFromContent,
  listPublicSummaryLocales,
  matchPublicSummaryOutput,
  normalizeSummaryLanguageTag,
  parseCurrentSummary,
  pickPreferredSummaryOutput,
  resolveSummaryLocale,
} from './summary-contract'

const validSummary = {
  version: 4,
  language: 'en',
  tl_dr: 'Short takeaway.',
  overview: 'Structured overview.',
  keypoints: [
    {
      title: 'Point A',
      detail: 'Important detail.',
      evidence: 'Quoted support.',
      why_it_matters: 'Why it matters.',
      startSeconds: 12,
    },
  ],
  sections: [
    {
      section_type: 'insights',
      title: 'Insights',
      description: 'Extra detail.',
      items: [{ content: 'Item 1' }],
    },
  ],
}

describe('summary-contract', () => {
  it('accepts a valid V4 summary payload', () => {
    expect(parseCurrentSummary(JSON.stringify(validSummary))).toEqual(validSummary)
  })

  it('rejects plain-text summaries', () => {
    expect(parseCurrentSummary('legacy markdown summary')).toBeNull()
  })

  it('rejects malformed JSON payloads', () => {
    expect(parseCurrentSummary('{ not-json')).toBeNull()
  })

  it('rejects summaries older than V4', () => {
    expect(
      parseCurrentSummary(
        JSON.stringify({
          ...validSummary,
          version: 3,
        })
      )
    ).toBeNull()
  })

  it('rejects summaries with an empty overview', () => {
    expect(
      parseCurrentSummary(
        JSON.stringify({
          ...validSummary,
          overview: '   ',
        })
      )
    ).toBeNull()
  })

  it('rejects summaries with empty keypoints', () => {
    expect(
      parseCurrentSummary(
        JSON.stringify({
          ...validSummary,
          keypoints: [],
        })
      )
    ).toBeNull()
  })

  it('rejects keypoints missing evidence', () => {
    expect(
      parseCurrentSummary(
        JSON.stringify({
          ...validSummary,
          keypoints: [
            {
              title: 'Point A',
              detail: 'Important detail.',
              evidence: '   ',
            },
          ],
        })
      )
    ).toBeNull()
  })

  it('accepts only safe, complete V5 UI blocks', () => {
    const parsed = parseCurrentSummary({
      ...validSummary,
      version: 5,
      ui_blocks: [
        {
          kind: 'comparison_table',
          id: 'comparison-1',
          title: 'A useful comparison',
          columns: ['Option A', 'Option B'],
          rows: [
            { label: 'Cost', values: ['Low', 'High'], evidence: 'A supported quote.' },
            { label: 'Speed', values: ['Fast', 'Slow'], evidence: 'Another supported quote.' },
          ],
        },
        {
          kind: 'bar_chart',
          id: 'chart-1',
          title: 'Verified values',
          unit: 'items',
          values: [
            { label: 'First', value: 3, evidence: 'Quoted 3.' },
            { label: 'Second', value: 5, evidence: 'Quoted 5.' },
            { label: 'Third', value: 8, evidence: 'Quoted 8.' },
          ],
        },
      ],
    })

    expect(parsed?.uiBlocks).toHaveLength(2)
    expect(parsed?.uiBlocks?.[0]).toMatchObject({ kind: 'comparison_table', id: 'comparison-1' })
    expect(parsed?.uiBlocks?.[1]).toMatchObject({ kind: 'bar_chart', id: 'chart-1' })
  })

  it('drops malformed UI blocks and keeps the text summary readable', () => {
    const parsed = parseCurrentSummary({
      ...validSummary,
      version: 5,
      ui_blocks: [
        {
          kind: 'bar_chart',
          id: 'chart-1',
          title: 'Not enough data',
          unit: 'items',
          values: [{ label: 'Only one', value: 1, evidence: 'Unsupported chart.' }],
        },
      ],
    })

    expect(parsed).toMatchObject({ overview: 'Structured overview.', keypoints: validSummary.keypoints })
    expect(parsed?.uiBlocks).toBeUndefined()
  })

  it('prefers the canonical locale-null summary and ignores invalid rows', () => {
    const picked = pickPreferredSummaryOutput([
      {
        kind: 'summary',
        status: 'completed',
        locale: 'zh',
        content: 'legacy text summary',
      },
      {
        kind: 'summary',
        status: 'completed',
        locale: 'ja',
        content: JSON.stringify({ ...validSummary, language: 'ja' }),
      },
      {
        kind: 'summary',
        status: 'completed',
        locale: null,
        content: JSON.stringify(validSummary),
      },
    ])

    expect(picked).toEqual(
      expect.objectContaining({
        locale: null,
        kind: 'summary',
      })
    )
  })

  it('selects a localized summary using exact or base-language locale matching', () => {
    const picked = pickPreferredSummaryOutput(
      [
        {
          kind: 'summary',
          status: 'completed',
          locale: null,
          content: JSON.stringify(validSummary),
        },
        {
          kind: 'summary',
          status: 'completed',
          locale: 'zh',
          content: JSON.stringify({ ...validSummary, language: 'zh' }),
        },
      ],
      'zh-CN'
    )

    expect(picked).toEqual(
      expect.objectContaining({
        locale: 'zh',
      })
    )
  })

  it('falls back to the canonical summary when the requested locale is unavailable', () => {
    const picked = pickPreferredSummaryOutput(
      [
        {
          kind: 'summary',
          status: 'completed',
          locale: 'zh',
          content: JSON.stringify({ ...validSummary, language: 'zh' }),
        },
        {
          kind: 'summary',
          status: 'completed',
          locale: null,
          content: JSON.stringify(validSummary),
        },
      ],
      'ja'
    )

    expect(picked).toEqual(
      expect.objectContaining({
        locale: null,
      })
    )
  })

  it('ignores an invalid localized summary before falling back', () => {
    const picked = pickPreferredSummaryOutput(
      [
        {
          kind: 'summary',
          status: 'completed',
          locale: 'zh',
          content: 'legacy text summary',
        },
        {
          kind: 'summary',
          status: 'completed',
          locale: null,
          content: JSON.stringify(validSummary),
        },
      ],
      'zh'
    )

    expect(picked).toEqual(
      expect.objectContaining({
        locale: null,
      })
    )
  })

  it('builds markdown and excerpt only from valid V4 summaries', () => {
    const markdown = buildSummaryMarkdownFromContent(JSON.stringify(validSummary))
    const excerpt = buildSummaryExcerptFromContent(JSON.stringify(validSummary), 60)

    expect(markdown).toContain('## In Brief')
    expect(markdown).toContain('## Overview')
    expect(markdown).toContain('## Key Points')
    expect(excerpt).toContain('Short takeaway.')
    expect(buildSummaryMarkdownFromContent('legacy text summary')).toBe('')
    expect(buildSummaryExcerptFromContent('{ bad json', 60)).toBe('')
  })

  it('localizes generated summary structure without changing source content', () => {
    const markdown = buildSummaryMarkdownFromContent(JSON.stringify(validSummary), 'zh-CN')

    expect(markdown).toContain('## 内容摘要')
    expect(markdown).toContain('## 内容概览')
    expect(markdown).toContain('## 关键观点')
    expect(markdown).toContain('为什么重要: Why it matters.')
    expect(markdown).toContain('原文证据: Quoted support.')
    expect(markdown).toContain('## 更多内容')
  })

  it('builds a detail-only digest without repeating the lead summary or key points', () => {
    const markdown = buildDetailedSummaryMarkdownFromContent(JSON.stringify(validSummary), 'zh-CN')

    expect(markdown).toContain('## 内容概览')
    expect(markdown).toContain('## 更多内容')
    expect(markdown).not.toContain('## 内容摘要')
    expect(markdown).not.toContain('## 关键观点')
    expect(markdown).not.toContain('Point A')
  })

  it('omits an overview already used as the lead summary', () => {
    const markdown = buildDetailedSummaryMarkdownFromContent(JSON.stringify({
      ...validSummary,
      tl_dr: undefined,
      sections: [],
    }))

    expect(markdown).toBe('')
  })

  it('normalizes summary language aliases for supported public locales', () => {
    expect(normalizeSummaryLanguageTag('Japanese')).toBe('ja')
    expect(resolveSummaryLocale('zh-CN')).toBe('zh')
    expect(resolveSummaryLocale('English')).toBe('en')
    expect(resolveSummaryLocale('ko')).toBeNull()
  })

  it('matches only the route locale for public rendering and exposes a supported alternative', () => {
    const matched = matchPublicSummaryOutput(
      [{
        kind: 'summary',
        status: 'completed',
        locale: 'zh',
        content: JSON.stringify({ ...validSummary, language: 'zh' }),
      }],
      'en'
    )

    expect(matched).toMatchObject({
      output: null,
      summary: null,
      routeLocale: 'en',
      summaryLocale: null,
      availableLocales: ['zh'],
      alternativeLocale: 'zh',
      routeMatches: false,
    })
  })

  it('trusts the parsed summary language over a conflicting output locale', () => {
    const matched = matchPublicSummaryOutput(
      [{
        kind: 'summary',
        status: 'completed',
        locale: 'en',
        content: JSON.stringify({ ...validSummary, language: 'zh' }),
      }],
      'en'
    )

    expect(matched).toMatchObject({
      output: null,
      availableLocales: ['zh'],
      alternativeLocale: 'zh',
      routeMatches: false,
    })
  })

  it('keeps sitemap locales lightweight and ordered by product priority', () => {
    expect(listPublicSummaryLocales([
      { kind: 'summary', status: 'completed', locale: 'zh' },
      { kind: 'summary', status: 'completed', locale: 'en' },
      { kind: 'summary', status: 'completed', locale: 'ko' },
      { kind: 'summary', status: 'failed', locale: 'ja' },
    ])).toEqual(['en', 'zh'])
  })

  it('uses the database-owned public language projection as the publication boundary', () => {
    const outputs = [
      {
        kind: 'summary',
        status: 'completed',
        locale: 'en',
        content: JSON.stringify({ ...validSummary, language: 'en' }),
      },
      {
        kind: 'summary',
        status: 'completed',
        locale: 'zh',
        content: JSON.stringify({ ...validSummary, language: 'zh' }),
      },
    ]

    expect(listPublicSummaryLocales(outputs, 'zh-CN')).toEqual(['zh'])
    expect(matchPublicSummaryOutput(outputs, 'en', 'zh-CN')).toMatchObject({
      output: null,
      availableLocales: ['zh'],
      alternativeLocale: 'zh',
      routeMatches: false,
    })
    expect(matchPublicSummaryOutput(outputs, 'zh', 'zh-CN')).toMatchObject({
      summaryLocale: 'zh',
      availableLocales: ['zh'],
      alternativeLocale: null,
      routeMatches: true,
    })
    expect(listPublicSummaryLocales(outputs, 'ko')).toEqual([])
    expect(matchPublicSummaryOutput(outputs, 'en', 'ko')).toMatchObject({
      output: null,
      availableLocales: [],
      alternativeLocale: null,
      routeMatches: false,
    })
  })

  it('treats a locale-null summary as the projected public language when quality flags provide it', () => {
    const matched = matchPublicSummaryOutput(
      [{
        kind: 'summary',
        status: 'completed',
        locale: null,
        content: JSON.stringify({ ...validSummary, language: 'unknown' }),
      }],
      'zh',
      'zh-CN'
    )

    expect(matched.routeMatches).toBe(true)
    expect(matched.summary?.language).toBe('unknown')
    expect(matched.summaryLocale).toBe('zh')
    expect(listPublicSummaryLocales(
      [{
        kind: 'summary',
        status: 'completed',
        locale: null,
      }],
      'zh-CN'
    )).toEqual(['zh'])
  })
})
