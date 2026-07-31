export interface CurrentSummaryKeyPoint {
  title: string
  detail: string
  evidence: string
  why_it_matters?: string
  startSeconds?: number
  endSeconds?: number
}

export interface CurrentSummarySectionItem {
  content: string
  metadata?: Record<string, unknown>
}

export interface CurrentSummarySection {
  section_type: string
  title?: string
  description?: string
  items: CurrentSummarySectionItem[]
}

export interface CurrentSummary {
  version: number
  language: string
  tl_dr?: string
  overview: string
  keypoints: CurrentSummaryKeyPoint[]
  sections: CurrentSummarySection[]
  context?: Record<string, unknown>
  content_type?: Record<string, unknown>
}

export interface SummaryOutputCandidate {
  kind?: string | null
  status?: string | null
  locale?: string | null
  content?: unknown
  created_at?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asVersion(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10)
  }
  return undefined
}

function parseSummaryObject(content: unknown): Record<string, unknown> | null {
  if (isRecord(content)) return content
  if (typeof content !== 'string') return null

  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) return null

  try {
    const parsed = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function formatSectionTitle(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function parseCurrentSummary(content: unknown): CurrentSummary | null {
  const value = parseSummaryObject(content)
  if (!value) return null

  const version = asVersion(value.version)
  const language = asNonEmptyString(value.language)
  const overview = asNonEmptyString(value.overview)

  if (version === undefined || version < 4 || !language || !overview) {
    return null
  }

  const keypointsRaw = Array.isArray(value.keypoints) ? value.keypoints : []
  const keypoints: CurrentSummaryKeyPoint[] = []
  for (const item of keypointsRaw) {
    const point = isRecord(item) ? item : {}
    const title = asNonEmptyString(point.title)
    const detail = asNonEmptyString(point.detail)
    const evidence = asNonEmptyString(point.evidence)

    if (!title || !detail || !evidence) {
      continue
    }

    keypoints.push({
      title,
      detail,
      evidence,
      why_it_matters: asNonEmptyString(point.why_it_matters),
      startSeconds: asNumber(point.startSeconds),
      endSeconds: asNumber(point.endSeconds),
    })
  }

  if (keypoints.length === 0) {
    return null
  }

  const sectionsRaw = Array.isArray(value.sections) ? value.sections : []
  const sections: CurrentSummarySection[] = []
  for (const section of sectionsRaw) {
    const safeSection = isRecord(section) ? section : {}
    const itemsRaw = Array.isArray(safeSection.items) ? safeSection.items : []
    const items: CurrentSummarySectionItem[] = []

    for (const item of itemsRaw) {
      const safeItem = isRecord(item) ? item : {}
      const content = asNonEmptyString(safeItem.content)
      if (!content) {
        continue
      }

      items.push({
        content,
        metadata: isRecord(safeItem.metadata) ? safeItem.metadata : undefined,
      })
    }

    const sectionType = asNonEmptyString(safeSection.section_type) ?? 'section'
    const title = asNonEmptyString(safeSection.title)
    const description = asNonEmptyString(safeSection.description)

    if (items.length === 0 && !title && !description) {
      continue
    }

    sections.push({
      section_type: sectionType,
      title,
      description,
      items,
    })
  }

  return {
    version,
    language,
    tl_dr: asNonEmptyString(value.tl_dr),
    overview,
    keypoints,
    sections,
    context: isRecord(value.context) ? value.context : undefined,
    content_type: isRecord(value.content_type) ? value.content_type : undefined,
  }
}

function normalizeLocale(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/_/g, '-') ?? ''
}

export function pickPreferredSummaryOutput<T extends SummaryOutputCandidate>(
  outputs: T[],
  preferredLocale?: string | null
): T | null {
  const validOutputs = outputs.filter(
    (output) =>
      output.kind === 'summary' &&
      output.status === 'completed' &&
      parseCurrentSummary(output.content) !== null
  )

  if (validOutputs.length === 0) {
    return null
  }

  const normalizedPreference = normalizeLocale(preferredLocale)
  if (normalizedPreference) {
    const exactMatch = validOutputs.find(
      (output) => normalizeLocale(output.locale) === normalizedPreference
    )
    if (exactMatch) {
      return exactMatch
    }

    const preferredLanguage = normalizedPreference.split('-')[0]
    const languageMatch = validOutputs.find((output) => {
      const locale = normalizeLocale(output.locale)
      return locale !== '' && locale.split('-')[0] === preferredLanguage
    })
    if (languageMatch) {
      return languageMatch
    }
  }

  const canonical = validOutputs.find(
    (output) => output.locale === null || typeof output.locale === 'undefined'
  )

  return canonical ?? validOutputs[0] ?? null
}

export function buildSummaryMarkdown(summary: CurrentSummary): string {
  const parts: string[] = []

  if (summary.tl_dr) {
    parts.push(`## In Brief\n${summary.tl_dr}`)
  }

  parts.push(`## Overview\n${summary.overview}`)

  const keypointLines = summary.keypoints.map((keypoint) => {
    const detailParts = [
      keypoint.detail,
      keypoint.why_it_matters ? `Why it matters: ${keypoint.why_it_matters}` : '',
      `Evidence: ${keypoint.evidence}`,
    ].filter(Boolean)

    return `- ${keypoint.title}: ${detailParts.join(' ')}`
  })
  parts.push(`## Key Points\n${keypointLines.join('\n')}`)

  if (summary.sections.length > 0) {
    const sectionBlocks = summary.sections.map((section) => {
      const title = section.title || formatSectionTitle(section.section_type)
      const description = section.description ? `${section.description}\n` : ''
      const items = section.items.map((item) => `- ${item.content}`).join('\n')
      return `### ${title}\n${description}${items}`.trim()
    })

    parts.push(`## Sections\n${sectionBlocks.join('\n\n')}`)
  }

  return parts.join('\n\n').trim()
}

export function buildSummaryMarkdownFromContent(content: unknown): string {
  const summary = parseCurrentSummary(content)
  return summary ? buildSummaryMarkdown(summary) : ''
}

export function toPlainText(markdown: string): string {
  return markdown
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}

export function buildSummaryExcerptFromContent(content: unknown, maxLength: number): string {
  const markdown = buildSummaryMarkdownFromContent(content)
  if (!markdown) return ''
  return truncateText(toPlainText(markdown), maxLength)
}
