import { describe, expect, it } from 'vitest'
import { buildSourceIndex, readSource, searchSource } from './source-index'

const raw = (segments: unknown[]) => JSON.stringify({
  version: 1,
  model: 'fixture-only',
  language: 'en',
  segments,
})

describe('buildSourceIndex', () => {
  it('indexes current script_raw segments and preserves timestamp precision', () => {
    const index = buildSourceIndex('output-1', raw([
      { start: 0, end: 4.875, duration: 4.875, text: ' Opening passage. ' },
      { start: 9.25, end: 15.1, text: 'The second passage.' },
    ]))
    expect(index.segments).toEqual([
      { id: `${index.version}:0`, text: 'Opening passage.', startSeconds: 0, endSeconds: 4.875 },
      { id: `${index.version}:1`, text: 'The second passage.', startSeconds: 9.25, endSeconds: 15.1 },
    ])
  })

  it('accepts numeric timestamps and duration-only ends without inventing missing anchors', () => {
    const index = buildSourceIndex('output-1', raw([
      { start: '12.5', duration: '2.25', text: 'Duration fallback.' },
      { start: 20, end: 15, text: 'Invalid ordering.' },
      { start: 25, text: 'Start only.' },
      { text: 'Untimed passage.' },
      { start: 'bad', end: -1, duration: 'NaN', text: 'Invalid anchors, valid text.' },
    ]))
    expect(index.segments).toMatchObject([
      { text: 'Duration fallback.', startSeconds: 12.5, endSeconds: 14.75 },
      { text: 'Invalid ordering.', startSeconds: 20, endSeconds: 20 },
      { text: 'Start only.', startSeconds: 25 },
      { text: 'Untimed passage.' },
      { text: 'Invalid anchors, valid text.' },
    ])
  })

  it('ignores malformed raw entries instead of indexing JSON metadata', () => {
    const index = buildSourceIndex('output-1', raw([
      null, false, ['array'], 42, { text: {} }, { text: '' }, { text: '  ' },
      { text: 'Valid passage.', start: '', end: true },
    ]))
    expect(index.segments).toEqual([{ id: `${index.version}:0`, text: 'Valid passage.' }])
    expect(buildSourceIndex('empty', raw([])).segments).toEqual([])
  })

  it('handles plain text and current Markdown timestamp markers', () => {
    const content = [
      'Untimed preface.', '', '**[00:00:03]**', '', 'Opening words.', '',
      '**[01:02:03]**', '', 'Last section.',
    ].join('\n')
    const index = buildSourceIndex('plain', content)
    expect(index.segments).toMatchObject([
      { text: 'Untimed preface.' },
      { text: 'Opening words.', startSeconds: 3 },
      { text: 'Last section.', startSeconds: 3723 },
    ])
  })

  it('supports MM:SS and inline markers while leaving invalid clock text untouched', () => {
    const index = buildSourceIndex('plain', '[02:03.5] Inline words.\r\n\r\n[03:99] Not a timestamp.')
    expect(index.segments).toEqual([
      { id: `${index.version}:0`, text: 'Inline words.', startSeconds: 123.5 },
      { id: `${index.version}:1`, text: '[03:99] Not a timestamp.', startSeconds: 123.5 },
    ])
  })

  it('does not lose plain text that begins with JSON-like content', () => {
    expect(buildSourceIndex('plain', '{This is not JSON.}').segments[0].text).toBe('{This is not JSON.}')
    expect(buildSourceIndex('plain', '42').segments[0].text).toBe('42')
    expect(buildSourceIndex('plain', '{"text":"Not script_raw"}').segments[0].text)
      .toBe('{"text":"Not script_raw"}')
  })

  it('has deterministic content- and source-scoped IDs that expire on any content update', () => {
    const original = buildSourceIndex('source-1', 'Same content.')
    expect(buildSourceIndex('source-1', 'Same content.')).toEqual(original)
    expect(buildSourceIndex('source-2', 'Same content.').version).not.toBe(original.version)
    expect(buildSourceIndex('source-1', 'Same content. Updated.').version).not.toBe(original.version)
    expect(original.segments[0].id).toContain(original.version)
  })

  it('indexes all of a very long passage with bounded chunks and original time ranges', () => {
    const index = buildSourceIndex('long', raw([
      { text: `${'x'.repeat(100_000)} Finalneedle.`, start: 10, end: 900 },
    ]))
    expect(index.segments.length).toBeGreaterThan(50)
    expect(new Set(index.segments.map(({ id }) => id)).size).toBe(index.segments.length)
    expect(index.segments.every(({ text }) => text.length <= 1800)).toBe(true)
    expect(index.segments.every(({ startSeconds, endSeconds }) => startSeconds === 10 && endSeconds === 900))
      .toBe(true)
    expect(searchSource(index, 'Finalneedle')[0].text).toContain('Finalneedle')
  })

  it('does not split Unicode surrogate pairs at chunk or overlap boundaries', () => {
    const index = buildSourceIndex('unicode', `${'a'.repeat(1799)}${'😀'.repeat(2000)}`)
    expect(index.segments.every(({ text }) => text.isWellFormed())).toBe(true)
    expect(index.segments.every(({ text }) => text.length <= 1800)).toBe(true)
  })

  it('treats blank input as an empty index', () => {
    expect(buildSourceIndex('blank', ' \n\r\n ').segments).toEqual([])
  })
})

describe('searchSource', () => {
  it('finds evidence near the end instead of filling the result with opening passages', () => {
    const content = Array.from({ length: 80 }, (_, i) => `Background section ${i}: unrelated discussion.`)
      .concat('Final evidence: the tokenizer uses byte-pair encoding with merge ranks.')
      .join('\n\n')
    const index = buildSourceIndex('source', content)
    const matches = searchSource(index, 'tokenizer merge ranks')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual(index.segments[80])
  })

  it('returns no evidence for unmatched, empty or stop-word-only queries', () => {
    const index = buildSourceIndex('source', 'A source about tokenization.')
    for (const query of ['photosynthesis', ' ', '???', 'what is the', '分词器']) {
      expect(searchSource(index, query)).toEqual([])
    }
  })

  it('matches Latin words case-insensitively, including short technical terms and accents', () => {
    const index = buildSourceIndex('source', 'AI uses a naïve tokenizer with UTF-8 encoding.')
    for (const query of ['ai', 'NAIVE', 'utf-8']) {
      expect(searchSource(index, query)).toHaveLength(1)
    }
  })

  it('does not match Latin substrings inside unrelated words', () => {
    const index = buildSourceIndex('source', 'The concatenate function educates developers.')
    expect(searchSource(index, 'cat')).toEqual([])
  })

  it('retrieves Chinese bigrams and single characters without space-delimited token assumptions', () => {
    const index = buildSourceIndex('source', '这一段介绍语音识别。\n\n分词器通过合并字节对建立词表。')
    expect(searchSource(index, '分词器如何建立词表')).toEqual([index.segments[1]])
    expect(searchSource(index, '词')).toEqual([index.segments[1]])
  })

  it('can retrieve kana and Hangul passages', () => {
    const index = buildSourceIndex('source', 'トークナイザーを説明します。\n\n토크나이저를 설명합니다.')
    expect(searchSource(index, 'トークナイザー')[0]).toEqual(index.segments[0])
    expect(searchSource(index, '토크나이저')[0]).toEqual(index.segments[1])
  })

  it('ranks matching phrases ahead of partial matches with stable source order for ties', () => {
    const index = buildSourceIndex('source', 'The cache is temporary.\n\nA token cache avoids repeated work.\n\nThe cache is temporary.')
    const result = searchSource(index, 'token cache')
    expect(result.map(({ id }) => id)).toEqual([
      index.segments[1].id, index.segments[0].id, index.segments[2].id,
    ])
  })

  it('honors bounded limits and never returns unbounded output for invalid numbers', () => {
    const index = buildSourceIndex('source', Array.from({ length: 30 }, (_, i) => `Tokenizer ${i}`).join('\n\n'))
    expect(searchSource(index, 'tokenizer')).toHaveLength(6)
    expect(searchSource(index, 'tokenizer', 2.9)).toHaveLength(2)
    expect(searchSource(index, 'tokenizer', 1000)).toHaveLength(12)
    for (const limit of [0, -1, NaN, Infinity]) {
      expect(searchSource(index, 'tokenizer', limit)).toEqual([])
    }
  })

  it('retains evidence across a long-chunk boundary', () => {
    const index = buildSourceIndex('source', `${'背景'.repeat(895)}关键证据在分片边界附近${'后文'.repeat(900)}`)
    expect(searchSource(index, '关键证据在分片边界附近').some(({ text }) => text.includes('关键证据在分片边界附近')))
      .toBe(true)
  })

  it('returns copies without mutating the source index', () => {
    const index = buildSourceIndex('source', 'Tokenizer evidence.')
    searchSource(index, 'tokenizer')[0].text = 'Mutated by caller.'
    expect(index.segments[0].text).toBe('Tokenizer evidence.')
  })
})

describe('readSource', () => {
  it('reads requested IDs in order, omitting unknown and duplicate references', () => {
    const index = buildSourceIndex('source', 'First.\n\nSecond.\n\nThird.')
    expect(readSource(index, [index.segments[2].id, 'unknown', index.segments[0].id, index.segments[2].id]))
      .toEqual([index.segments[2], index.segments[0]])
  })

  it('ignores IDs from a previous content version or a different source', () => {
    const previous = buildSourceIndex('source', 'Original content.')
    const updated = buildSourceIndex('source', 'Updated content.')
    const otherSource = buildSourceIndex('other', 'Updated content.')
    expect(readSource(updated, [previous.segments[0].id, otherSource.segments[0].id])).toEqual([])
  })

  it('enforces the total character budget, including a partial final segment', () => {
    const index = buildSourceIndex('source', raw([
      { text: 'First passage.', start: 1, end: 5 },
      { text: 'Second passage.', start: 5, end: 9 },
    ]))
    const result = readSource(index, index.segments.map(({ id }) => id), 18)
    expect(result.map(({ text }) => text)).toEqual(['First passage.', 'Seco'])
    expect(result.reduce((count, { text }) => count + text.length, 0)).toBe(18)
    expect(result[1]).toMatchObject({ startSeconds: 5, endSeconds: 9 })
    expect(index.segments[1].text).toBe('Second passage.')
  })

  it('caps requests at the default 12000 characters even with a larger requested budget', () => {
    const index = buildSourceIndex('source', 'Long text. '.repeat(20_000))
    const ids = index.segments.map(({ id }) => id)
    expect(readSource(index, ids).reduce((count, { text }) => count + text.length, 0)).toBe(12_000)
    expect(readSource(index, ids, 1_000_000).reduce((count, { text }) => count + text.length, 0)).toBe(12_000)
  })

  it('fails closed for empty, zero, negative or non-finite budgets', () => {
    const index = buildSourceIndex('source', 'First passage.')
    expect(readSource(index, [])).toEqual([])
    for (const budget of [0, -1, NaN, Infinity]) {
      expect(readSource(index, [index.segments[0].id], budget)).toEqual([])
    }
    expect(readSource(index, [index.segments[0].id], 3.9)[0].text).toBe('Fir')
  })

  it('does not return a broken Unicode character when the budget ends inside it', () => {
    const index = buildSourceIndex('source', 'Hi😀 there.\n\n😀 again.')
    expect(readSource(index, [index.segments[0].id], 3)[0].text).toBe('Hi')
    expect(readSource(index, [index.segments[1].id], 1)).toEqual([])
  })
})
