import { describe, expect, it } from 'vitest'

import {
  buildSummaryExcerptFromContent,
  buildSummaryMarkdownFromContent,
  parseCurrentSummary,
  pickPreferredSummaryOutput,
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
})
