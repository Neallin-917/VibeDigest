import type { Locale } from '@/lib/i18n'

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

export type ComparisonTableBlock = {
  kind: 'comparison_table'
  id: string
  title: string
  columns: string[]
  rows: Array<{
    label: string
    values: string[]
    evidence: string
  }>
}

export type BarChartBlock = {
  kind: 'bar_chart'
  id: string
  title: string
  unit: string
  values: Array<{
    label: string
    value: number
    evidence: string
  }>
}

export type StepsBlock = {
  kind: 'steps'
  id: string
  title: string
  steps: Array<{
    title: string
    detail: string
    evidence: string
  }>
}

export type CurrentSummaryUiBlock = ComparisonTableBlock | BarChartBlock | StepsBlock

export interface CurrentSummary {
  version: number
  language: string
  tl_dr?: string
  overview: string
  keypoints: CurrentSummaryKeyPoint[]
  sections: CurrentSummarySection[]
  uiBlocks?: CurrentSummaryUiBlock[]
  context?: Record<string, unknown>
  content_type?: Record<string, unknown>
}

export interface SummaryOutputCandidate {
  kind?: string | null
  status?: string | null
  locale?: string | null
  content?: unknown
  created_at?: string | null
  updated_at?: string | null
  provenance?: unknown
}

export type PublicSummaryLocaleCandidate = Pick<
  SummaryOutputCandidate,
  "kind" | "status" | "locale"
>

export type PublicSummaryMatch<T extends SummaryOutputCandidate = SummaryOutputCandidate> = {
  output: T | null
  summary: CurrentSummary | null
  routeLocale: Locale
  summaryLocale: Locale | null
  availableLocales: Locale[]
  alternativeLocale: Locale | null
  routeMatches: boolean
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

function asStringArray(value: unknown, minLength: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) return null

  const strings = value.map(asNonEmptyString)
  return strings.every((item): item is string => Boolean(item)) ? strings : null
}

function parseUiBlocks(value: unknown): CurrentSummaryUiBlock[] {
  if (!Array.isArray(value)) return []

  const blocks: CurrentSummaryUiBlock[] = []
  const seenKinds = new Set<CurrentSummaryUiBlock['kind']>()

  for (const candidate of value.slice(0, 2)) {
    if (!isRecord(candidate)) continue

    const kind = asNonEmptyString(candidate.kind)
    const id = asNonEmptyString(candidate.id)
    const title = asNonEmptyString(candidate.title)
    if (!kind || !id || !title || seenKinds.has(kind as CurrentSummaryUiBlock['kind'])) continue

    if (kind === 'comparison_table') {
      const columns = asStringArray(candidate.columns, 2, 4)
      if (!columns || !Array.isArray(candidate.rows) || candidate.rows.length < 2 || candidate.rows.length > 5) continue

      const rows = candidate.rows.flatMap(row => {
        if (!isRecord(row)) return []
        const label = asNonEmptyString(row.label)
        const values = asStringArray(row.values, columns.length, columns.length)
        const evidence = asNonEmptyString(row.evidence)
        return label && values && evidence ? [{ label, values, evidence }] : []
      })
      if (rows.length !== candidate.rows.length) continue

      blocks.push({ kind, id, title, columns, rows })
      seenKinds.add(kind)
      continue
    }

    if (kind === 'bar_chart') {
      const unit = asNonEmptyString(candidate.unit)
      if (!unit || !Array.isArray(candidate.values) || candidate.values.length < 3 || candidate.values.length > 5) continue

      const values = candidate.values.flatMap(item => {
        if (!isRecord(item)) return []
        const label = asNonEmptyString(item.label)
        const numericValue = asNumber(item.value)
        const evidence = asNonEmptyString(item.evidence)
        return label && numericValue !== undefined && numericValue >= 0 && evidence
          ? [{ label, value: numericValue, evidence }]
          : []
      })
      if (values.length !== candidate.values.length) continue

      blocks.push({ kind, id, title, unit, values })
      seenKinds.add(kind)
      continue
    }

    if (kind === 'steps') {
      if (!Array.isArray(candidate.steps) || candidate.steps.length < 3 || candidate.steps.length > 7) continue

      const steps = candidate.steps.flatMap(step => {
        if (!isRecord(step)) return []
        const stepTitle = asNonEmptyString(step.title)
        const detail = asNonEmptyString(step.detail)
        const evidence = asNonEmptyString(step.evidence)
        return stepTitle && detail && evidence ? [{ title: stepTitle, detail, evidence }] : []
      })
      if (steps.length !== candidate.steps.length) continue

      blocks.push({ kind, id, title, steps })
      seenKinds.add(kind)
    }
  }

  return blocks
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

  const uiBlocks = parseUiBlocks(value.ui_blocks)

  return {
    version,
    language,
    tl_dr: asNonEmptyString(value.tl_dr),
    overview,
    keypoints,
    sections,
    ...(uiBlocks.length > 0 ? { uiBlocks } : {}),
    context: isRecord(value.context) ? value.context : undefined,
    content_type: isRecord(value.content_type) ? value.content_type : undefined,
  }
}

function normalizeLocale(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/_/g, '-') ?? ''
}

const LANGUAGE_NAME_ALIASES: Record<string, string> = {
  english: 'en',
  chinese: 'zh',
  'simplified chinese': 'zh-CN',
  'traditional chinese': 'zh-TW',
  中文: 'zh',
  简体中文: 'zh-CN',
  繁体中文: 'zh-TW',
  繁體中文: 'zh-TW',
  japanese: 'ja',
  jp: 'ja',
  日本語: 'ja',
  korean: 'ko',
  한국어: 'ko',
  韩语: 'ko',
  韓語: 'ko',
  spanish: 'es',
  español: 'es',
  西班牙语: 'es',
}

export function normalizeSummaryLanguageTag(language?: string | null) {
  const raw = language?.trim() || ''
  if (!raw || raw.length > 64) return null

  const normalized = raw.toLowerCase().replace(/_/g, '-')
  if (normalized === 'unknown') return null
  const candidate = LANGUAGE_NAME_ALIASES[normalized] || normalized

  try {
    return Intl.getCanonicalLocales(candidate)[0] || null
  } catch {
    return null
  }
}

export function resolveSummaryLocale(language?: string | null): Locale | null {
  const baseLanguage = normalizeSummaryLanguageTag(language)?.split('-')[0]
  return baseLanguage === 'en' || baseLanguage === 'zh' || baseLanguage === 'ja'
    ? baseLanguage
    : null
}

function parseValidSummaryOutput<T extends SummaryOutputCandidate>(output: T) {
  if (output.kind !== 'summary' || output.status !== 'completed') return null

  const summary = parseCurrentSummary(output.content)
  if (!summary) return null

  return { output, summary }
}

function resolvePublicOutputLocale<T extends SummaryOutputCandidate>(
  output: T,
  summary: CurrentSummary,
  projectedLanguage?: string | null
) {
  const contentLanguage = normalizeSummaryLanguageTag(summary.language)
  if (contentLanguage) return resolveSummaryLocale(contentLanguage)

  const explicitLocale = resolveSummaryLocale(output.locale)
  if (explicitLocale) return explicitLocale

  return resolveSummaryLocale(projectedLanguage)
}

const PUBLIC_LOCALE_PRIORITY: Locale[] = ["en", "zh", "ja"]

function sortPublicLocales(locales: Iterable<Locale>) {
  const localeSet = new Set(locales)
  return PUBLIC_LOCALE_PRIORITY.filter((locale) => localeSet.has(locale))
}

export function pickPreferredSummaryOutput<T extends SummaryOutputCandidate>(
  outputs: T[],
  preferredLocale?: string | null
): T | null {
  const validOutputs = outputs.flatMap((output) => {
    const parsed = parseValidSummaryOutput(output)
    return parsed ? [parsed.output] : []
  })

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

export function listPublicSummaryLocales<T extends PublicSummaryLocaleCandidate>(
  outputs: T[],
  projectedLanguage?: string | null
): Locale[] {
  const completedSummaries = outputs.filter(
    (output) => output.kind === "summary" && output.status === "completed"
  )
  const normalizedProjectedLanguage = normalizeSummaryLanguageTag(projectedLanguage)
  const projectedLocale = resolveSummaryLocale(projectedLanguage)
  if (projectedLocale && completedSummaries.length > 0) return [projectedLocale]
  if (normalizedProjectedLanguage) return []

  const locales = new Set<Locale>()

  for (const output of completedSummaries) {
    const hasExplicitLocale = Boolean(output.locale?.trim())
    const locale = hasExplicitLocale
      ? resolveSummaryLocale(output.locale)
      : null
    if (locale) locales.add(locale)
  }

  return sortPublicLocales(locales)
}

export function matchPublicSummaryOutput<T extends SummaryOutputCandidate>(
  outputs: T[],
  routeLocale: Locale,
  projectedLanguage?: string | null
): PublicSummaryMatch<T> {
  const validOutputs = outputs.flatMap((output) => {
    const parsed = parseValidSummaryOutput(output)
    if (!parsed) return []

    return [{
      ...parsed,
      summaryLocale: resolvePublicOutputLocale(parsed.output, parsed.summary, projectedLanguage),
    }]
  })

  const normalizedProjectedLanguage = normalizeSummaryLanguageTag(projectedLanguage)
  const projectedLocale = resolveSummaryLocale(projectedLanguage)
  const eligibleOutputs = projectedLocale
    ? validOutputs.filter((item) => item.summaryLocale === projectedLocale)
    : normalizedProjectedLanguage
      ? []
      : validOutputs

  const availableLocales = sortPublicLocales(
    eligibleOutputs.flatMap((item) => item.summaryLocale ? [item.summaryLocale] : [])
  )

  const matched = eligibleOutputs.find((item) => item.summaryLocale === routeLocale)

  if (matched) {
    return {
      output: matched.output,
      summary: matched.summary,
      routeLocale,
      summaryLocale: matched.summaryLocale,
      availableLocales,
      alternativeLocale: null,
      routeMatches: true,
    }
  }

  return {
    output: null,
    summary: null,
    routeLocale,
    summaryLocale: null,
    availableLocales,
    alternativeLocale: availableLocales[0] ?? null,
    routeMatches: false,
  }
}

const SUMMARY_MARKDOWN_COPY = {
  en: {
    inBrief: 'In Brief', overview: 'Overview', keyPoints: 'Key Points', sections: 'Sections',
    whyItMatters: 'Why it matters', evidence: 'Evidence',
  },
  zh: {
    inBrief: '内容摘要', overview: '内容概览', keyPoints: '关键观点', sections: '更多内容',
    whyItMatters: '为什么重要', evidence: '原文证据',
  },
  ja: {
    inBrief: '要点', overview: '概要', keyPoints: '重要ポイント', sections: 'その他の内容',
    whyItMatters: '重要な理由', evidence: '根拠',
  },
} as const

function summaryMarkdownCopy(locale?: string | null) {
  const language = normalizeLocale(locale).split('-')[0]
  return language === 'zh' || language === 'ja'
    ? SUMMARY_MARKDOWN_COPY[language]
    : SUMMARY_MARKDOWN_COPY.en
}

export function buildSummaryMarkdown(summary: CurrentSummary, locale?: string | null): string {
  const parts: string[] = []
  const copy = summaryMarkdownCopy(locale)

  if (summary.tl_dr) {
    parts.push(`## ${copy.inBrief}\n${summary.tl_dr}`)
  }

  parts.push(`## ${copy.overview}\n${summary.overview}`)

  const keypointLines = summary.keypoints.map((keypoint) => {
    const detailParts = [
      keypoint.detail,
      keypoint.why_it_matters ? `${copy.whyItMatters}: ${keypoint.why_it_matters}` : '',
      `${copy.evidence}: ${keypoint.evidence}`,
    ].filter(Boolean)

    return `- ${keypoint.title}: ${detailParts.join(' ')}`
  })
  parts.push(`## ${copy.keyPoints}\n${keypointLines.join('\n')}`)

  if (summary.sections.length > 0) {
    const sectionBlocks = summary.sections.map((section) => {
      const title = section.title || formatSectionTitle(section.section_type)
      const description = section.description ? `${section.description}\n` : ''
      const items = section.items.map((item) => `- ${item.content}`).join('\n')
      return `### ${title}\n${description}${items}`.trim()
    })

    parts.push(`## ${copy.sections}\n${sectionBlocks.join('\n\n')}`)
  }

  return parts.join('\n\n').trim()
}

export function buildSummaryMarkdownFromContent(content: unknown, locale?: string | null): string {
  const summary = parseCurrentSummary(content)
  return summary ? buildSummaryMarkdown(summary, locale) : ''
}

export function buildDetailedSummaryMarkdown(summary: CurrentSummary, locale?: string | null): string {
  const parts: string[] = []
  const copy = summaryMarkdownCopy(locale)

  if (summary.tl_dr && summary.overview !== summary.tl_dr) {
    parts.push(`## ${copy.overview}\n${summary.overview}`)
  }

  if (summary.sections.length > 0) {
    const sectionBlocks = summary.sections.map((section) => {
      const title = section.title || formatSectionTitle(section.section_type)
      const description = section.description ? `${section.description}\n` : ''
      const items = section.items.map((item) => `- ${item.content}`).join('\n')
      return `### ${title}\n${description}${items}`.trim()
    })

    parts.push(`## ${copy.sections}\n${sectionBlocks.join('\n\n')}`)
  }

  return parts.join('\n\n').trim()
}

export function buildDetailedSummaryMarkdownFromContent(content: unknown, locale?: string | null): string {
  const summary = parseCurrentSummary(content)
  return summary ? buildDetailedSummaryMarkdown(summary, locale) : ''
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

export function buildSummaryExcerptFromContent(content: unknown, maxLength: number, locale?: string | null): string {
  const markdown = buildSummaryMarkdownFromContent(content, locale)
  if (!markdown) return ''
  return truncateText(toPlainText(markdown), maxLength)
}
