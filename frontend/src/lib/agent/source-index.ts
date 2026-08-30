import { createHash } from 'node:crypto'

export interface SourceSegment {
  id: string
  text: string
  startSeconds?: number
  endSeconds?: number
}

export interface SourceIndex {
  version: string
  segments: SourceSegment[]
}

type SourcePassage = Omit<SourceSegment, 'id'>

const SEGMENT_CHARACTERS = 1_800
const CHUNK_OVERLAP = 160
const MAX_SEARCH_RESULTS = 12
const MAX_READ_CHARACTERS = 12_000
const MAX_QUERY_CHARACTERS = 1_000
const MAX_QUERY_TERMS = 64

const STOP_WORDS = new Set(
  'a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may of on or our should that the their them there these they this to was were what when where which who why will with would you your'.split(' '),
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function seconds(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function parseRawSegments(content: string): SourcePassage[] | undefined {
  let payload: unknown
  try {
    payload = JSON.parse(content)
  } catch {
    return undefined
  }
  if (!isRecord(payload) || !Array.isArray(payload.segments)) return undefined

  return payload.segments.flatMap((segment): SourcePassage[] => {
    if (!isRecord(segment) || typeof segment.text !== 'string' || !segment.text.trim()) {
      return []
    }
    const startSeconds = seconds(segment.start)
    const duration = seconds(segment.duration)
    const suppliedEnd = seconds(segment.end)
    const endSeconds = suppliedEnd ?? (
      startSeconds !== undefined && duration !== undefined
        ? seconds(startSeconds + duration)
        : undefined
    )

    return [{
      text: segment.text.trim(),
      ...(startSeconds !== undefined ? { startSeconds } : {}),
      ...(endSeconds !== undefined
        ? { endSeconds: Math.max(startSeconds ?? 0, endSeconds) }
        : {}),
    }]
  })
}

function clockSeconds(value: string): number | undefined {
  const parts = value.split(':').map(Number)
  const last = parts[parts.length - 1]
  if (last >= 60 || (parts.length === 3 && parts[1] >= 60)) return undefined
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function parsePlainText(content: string): SourcePassage[] {
  const passages: SourcePassage[] = []
  let startSeconds: number | undefined
  let lines: string[] = []

  const flush = () => {
    const text = lines.join('\n').trim()
    if (text) {
      passages.push({ text, ...(startSeconds !== undefined ? { startSeconds } : {}) })
    }
    lines = []
  }

  for (const line of content.split(/\r?\n/)) {
    // The transcriber emits **[HH:MM:SS]** on its own line. Also accept
    // unstyled [MM:SS] markers and text following a marker on the same line.
    const marker = line.trim().match(
      /^(?:\*\*)?\[(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?)\](?:\*\*)?(?:[ \t]+(.*))?$/,
    )
    const markerSeconds = marker ? clockSeconds(marker[1]) : undefined
    if (markerSeconds === undefined) {
      lines.push(line)
      continue
    }
    flush()
    startSeconds = markerSeconds
    if (marker?.[2]) lines.push(marker[2])
  }
  flush()
  return passages
}

function safeEnd(text: string, end: number): number {
  // Character budgets use JS string length (UTF-16 units), but never return
  // half of an astral character when a budget/chunk ends inside a surrogate pair.
  const previous = text.charCodeAt(end - 1)
  const next = text.charCodeAt(end)
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? end - 1
    : end
}

function splitText(text: string): string[] {
  const chunks: string[] = []
  for (const paragraph of text.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue
    let start = 0
    while (start < trimmed.length) {
      let end = safeEnd(trimmed, Math.min(start + SEGMENT_CHARACTERS, trimmed.length))
      if (end < trimmed.length) {
        // Prefer a word/sentence boundary. Overlap retains evidence straddling
        // the boundary, including CJK text without spaces.
        const candidate = trimmed.slice(start, end)
        const boundary = Math.max(
          candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'),
          candidate.lastIndexOf('。') + 1, candidate.lastIndexOf('！') + 1,
          candidate.lastIndexOf('？') + 1,
        )
        if (boundary > SEGMENT_CHARACTERS / 2) end = start + boundary
      }
      const chunk = trimmed.slice(start, end).trim()
      if (chunk) chunks.push(chunk)
      if (end === trimmed.length) break
      start = safeEnd(trimmed, end - CHUNK_OVERLAP)
    }
  }
  return chunks
}

/** Build an internal, source-scoped index; this is not a public transcript view. */
export function buildSourceIndex(sourceId: string, content: string): SourceIndex {
  const digest = createHash('sha256')
    .update('source-index-v1\0')
    .update(JSON.stringify(sourceId))
    .update('\0')
    .update(content)
    .digest('hex')
    .slice(0, 32)
  const version = `v1-${digest}`
  const passages = parseRawSegments(content) ?? parsePlainText(content)
  const segments = passages.flatMap(({ text, ...timestamps }) => (
    // A split raw segment retains its original (possibly broad) time range.
    // We do not invent word-level timestamps by interpolating characters.
    splitText(text).map((chunk) => ({ text: chunk, ...timestamps }))
  )).map((segment, position) => ({ id: `${version}:${position}`, ...segment }))

  return { version, segments }
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function terms(text: string, includeCjkCharacters = false): Set<string> {
  const normalized = normalize(text)
  const result = new Set(
    (normalized.match(/[a-z0-9]+(?:['’_-][a-z0-9]+)*/g) ?? [])
      .filter((term) => !STOP_WORDS.has(term)),
  )
  // Han, kana and Hangul are not reliably separated by spaces. Bigrams avoid
  // requiring a language service; single-character queries remain searchable.
  for (const sequence of normalized.match(/[\u3400-\u9fff\u3040-\u30ff\u1100-\u11ff\uac00-\ud7af]+/g) ?? []) {
    const characters = Array.from(sequence)
    if (includeCjkCharacters || characters.length === 1) {
      characters.forEach((character) => result.add(character))
    }
    for (let i = 0; i < characters.length - 1; i++) {
      result.add(characters[i] + characters[i + 1])
    }
  }
  return result
}

function positiveBudget(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0
}

/** Lexical retrieval only: the agent may rewrite/translate a query and retry. */
export function searchSource(index: SourceIndex, query: string, limit = 6): SourceSegment[] {
  const resultLimit = positiveBudget(limit, MAX_SEARCH_RESULTS)
  const normalizedQuery = normalize(query.slice(0, MAX_QUERY_CHARACTERS)).trim()
  const queryTerms = [...terms(normalizedQuery)].slice(0, MAX_QUERY_TERMS)
  if (!resultLimit || !queryTerms.length) return []

  const candidates = index.segments.map((segment, position) => {
    const segmentTerms = terms(segment.text, true)
    return {
      segment,
      position,
      matches: queryTerms.filter((term) => segmentTerms.has(term)),
    }
  }).filter(({ matches }) => matches.length > 0)

  const frequencies = new Map<string, number>()
  for (const { matches } of candidates) {
    for (const term of matches) frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
  }

  return candidates.map((candidate) => ({
    ...candidate,
    score: candidate.matches.reduce(
      (score, term) => score + 1 + Math.log(1 + index.segments.length / (frequencies.get(term) ?? 1)),
      0,
    ) + (normalize(candidate.segment.text).includes(normalizedQuery) ? queryTerms.length : 0),
  }))
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .slice(0, resultLimit)
    .map(({ segment }) => ({ ...segment }))
}

/** Read known IDs in request order; unknown/stale/duplicate IDs consume no budget. */
export function readSource(index: SourceIndex, ids: string[], maxCharacters = MAX_READ_CHARACTERS): SourceSegment[] {
  let remaining = positiveBudget(maxCharacters, MAX_READ_CHARACTERS)
  if (!remaining) return []
  const segments = new Map(index.segments.map((segment) => [segment.id, segment]))
  const selected: SourceSegment[] = []

  for (const id of new Set(ids)) {
    const segment = segments.get(id)
    if (!segment || !id.startsWith(`${index.version}:`)) continue
    const text = segment.text.slice(0, safeEnd(segment.text, Math.min(remaining, segment.text.length)))
    if (text) {
      selected.push({ ...segment, text })
      remaining -= text.length
    }
    if (!remaining) break
  }
  return selected
}
