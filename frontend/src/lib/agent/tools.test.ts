import { describe, expect, it, vi } from 'vitest'
import { createAgentTools } from './tools'
import { AgentServiceError, type AgentTurn, type TaskData, type TurnClient } from './backend'
import { buildSourceIndex } from './source-index'
import { buildSummaryMarkdownFromContent } from '@/lib/summary-contract'

const taskId = '44444444-4444-4444-8444-444444444444'
const turn: AgentTurn = {
  id: '33333333-3333-4333-8333-333333333333', thread_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222', input_message_id: 'user-1',
  task_id: taskId, status: 'running', execution_token: 'server-owned-private-token',
  runtime_config: { runtime: 'api', provider: 'openrouter', model: 'fixture-smart', modelTier: 'smart', reasoningEffort: 'provider-default', locale: 'zh' },
}
const raw = JSON.stringify({ version: 1, language: 'en', segments: [
  { text: 'Opening remarks unrelated to the question.', start: 0, end: 5 },
  { text: 'PRIVATE_EVIDENCE: tokenizer merges repeated byte pairs.', start: 83.75, end: 90 },
] })
const summary = (overview: string) => JSON.stringify({
  version: 4, language: 'zh', overview,
  keypoints: [{ title: 'Point', detail: 'A concise explanation.', evidence: 'A paraphrased supporting fact.' }], sections: [],
})

function fixture(outputs: TaskData['outputs'] = [{ id: 'raw', kind: 'script_raw', status: 'completed', locale: null, content: raw }]): TaskData {
  return { task: { id: taskId, status: 'completed', progress: 100, video_title: 'Tokenizer', video_url: 'https://www.youtube.com/watch?v=fixture&t=1', thumbnail_url: null }, outputs }
}
function setup(data = fixture(), options: Parameters<typeof createAgentTools>[2] = {}, config: Partial<AgentTurn['runtime_config']> = {}) {
  const client = {
    read: vi.fn<TurnClient['read']>().mockResolvedValue(data), history: vi.fn<TurnClient['history']>(),
    submit: vi.fn<TurnClient['submit']>().mockResolvedValue({ taskId, waiting: true, status: 'pending' }),
    watch: vi.fn<TurnClient['watch']>().mockResolvedValue({ taskId, waiting: true, status: 'processing' }),
    finish: vi.fn<TurnClient['finish']>(),
  }
  const bundle = createAgentTools({ ...turn, runtime_config: { ...turn.runtime_config, ...config } }, client, options)
  const call = async <T = Record<string, unknown>>(name: string, input: unknown) => {
    const item = bundle.localTools.find(tool => tool.name === name)
    if (!item) throw new Error('Unknown test tool: ' + name)
    return await item.execute(input) as T
  }
  return { bundle, client, call }
}
type EvidenceResult = {
  evidence: { id: string; text: string; startSeconds?: number; reference: { sourceId: string; title: string; url: string } }[]
  matched: boolean; truncated: boolean; remainingCharacters: number; sourceVersion: string
}

describe('shared Agent tool definitions', () => {
  it('exposes the same named business operations to both runtimes without model-supplied identity', () => {
    const { bundle } = setup()
    expect(Object.keys(bundle.tools)).toEqual(bundle.localTools.map(tool => tool.name))
    expect(bundle.localTools.filter(tool => !tool.readOnly).map(tool => tool.name)).toEqual(['create_video_task', 'continue_when_ready'])
    const schemas = JSON.stringify(bundle.localTools.map(tool => tool.inputSchema))
    for (const field of ['userId', 'execution_token', turn.execution_token, 'runtimeConfig', 'threadId']) expect(schemas).not.toContain(field)
  })

  it('removes all mutating tools for a background continuation', () => {
    const { bundle } = setup(undefined, { readOnly: true })
    expect(Object.keys(bundle.tools)).toEqual(['get_task_status', 'get_task_context', 'search_source', 'read_source'])
    expect(bundle.localTools.every(tool => tool.readOnly)).toBe(true)
  })

  it('prevents creation in source scope while retaining a continuation for the existing task', () => {
    const { bundle } = setup(undefined, {}, { scope: 'source' })
    expect(bundle.tools).not.toHaveProperty('create_video_task')
    expect(bundle.tools).toHaveProperty('continue_when_ready')
    expect(bundle.localTools.map(tool => tool.name)).not.toContain('create_video_task')
  })

  it('validates strict inputs before executing business operations and always finishes progress', async () => {
    const onProgress = vi.fn()
    const { call, client } = setup(undefined, { onProgress })
    await expect(call('get_task_status', { taskId, userId: 'attacker' })).rejects.toThrow()
    await expect(call('get_task_status', { taskId: 'not-a-uuid' })).rejects.toThrow()
    await expect(call('search_source', { taskId, query: ' ', limit: 2 })).rejects.toThrow()
    await expect(call('read_source', { taskId, segmentIds: [] })).rejects.toThrow()
    expect(client.read).not.toHaveBeenCalled()
    expect(onProgress.mock.calls.slice(0, 2)).toEqual([['get_task_status', 'running'], ['get_task_status', 'finished']])
  })

  it('shares a 16-call budget across tools and does not execute the seventeenth call', async () => {
    const { call, client } = setup()
    for (let i = 0; i < 16; i++) await call('get_task_status', { taskId })
    await expect(call('create_video_task', { videoUrl: 'https://youtu.be/fixture', locale: 'zh' })).resolves.toEqual({ error: expect.stringContaining('budget exhausted') })
    expect(client.read).toHaveBeenCalledTimes(16)
    expect(client.submit).not.toHaveBeenCalled()
  })

  it('propagates backend rejection and closes the progress event', async () => {
    const onProgress = vi.fn()
    const { client, call } = setup(undefined, { onProgress })
    client.read.mockRejectedValue(new Error('not authorized'))
    await expect(call('get_task_status', { taskId })).rejects.toThrow('not authorized')
    expect(onProgress.mock.calls).toEqual([['get_task_status', 'running'], ['get_task_status', 'finished']])
  })
})

describe('source retrieval and citations', () => {
  it('retrieves exact evidence with versioned IDs and emits only timestamped source references', async () => {
    const onPart = vi.fn()
    const { call, client, bundle } = setup(undefined, { onPart })
    const result = await call<EvidenceResult>('search_source', { taskId, query: 'tokenizer' })
    expect(client.read).toHaveBeenCalledWith(taskId, true)
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0]).toMatchObject({ text: expect.stringContaining('PRIVATE_EVIDENCE'), startSeconds: 83.75 })
    expect(result.evidence[0].id).toContain(result.sourceVersion)
    expect(result.evidence[0].reference).toMatchObject({ url: 'https://www.youtube.com/watch?v=fixture&t=83', title: 'Tokenizer · 1:23' })
    expect(onPart).toHaveBeenCalledWith({ type: 'source-url', ...result.evidence[0].reference })
    expect(JSON.stringify(onPart.mock.calls)).not.toContain('PRIVATE_EVIDENCE')
    expect(bundle.references.size).toBe(1)
    expect(bundle.taskParts).toEqual([])
  })

  it('never substitutes the opening passage for an unmatched query', async () => {
    const onPart = vi.fn()
    const { call } = setup(undefined, { onPart })
    const result = await call<EvidenceResult>('search_source', { taskId, query: 'photosynthesis' })
    expect(result).toMatchObject({ evidence: [], matched: false, remainingCharacters: 32_000 })
    expect(onPart).not.toHaveBeenCalled()
  })

  it('reuses one private source snapshot per task and deduplicates citations', async () => {
    const onPart = vi.fn()
    const { call, client } = setup(undefined, { onPart })
    const searched = await call<EvidenceResult>('search_source', { taskId, query: 'tokenizer' })
    const read = await call<EvidenceResult>('read_source', { taskId, segmentIds: [searched.evidence[0].id] })
    expect(read.evidence).toEqual(searched.evidence)
    expect(client.read).toHaveBeenCalledTimes(1)
    expect(onPart).toHaveBeenCalledTimes(1)
  })

  it('rejects fabricated and stale source IDs without producing evidence or citations', async () => {
    const onPart = vi.fn()
    const { call } = setup(undefined, { onPart })
    const stale = buildSourceIndex(taskId, 'Old source content.').segments[0].id
    expect(await call('read_source', { taskId, segmentIds: ['unknown', stale] })).toMatchObject({ evidence: [], matched: false })
    expect(onPart).not.toHaveBeenCalled()
  })

  it('prefers completed raw source but falls back to completed script, never pending output', async () => {
    const { call } = setup(fixture([
      { id: 'raw', kind: 'script_raw', status: 'processing', locale: null, content: raw },
      { id: 'script', kind: 'script', status: 'completed', locale: null, content: '[01:02] Fallback tokenizer evidence.' },
    ]))
    const result = await call<EvidenceResult>('search_source', { taskId, query: 'tokenizer' })
    expect(result.evidence[0]).toMatchObject({ text: 'Fallback tokenizer evidence.', startSeconds: 62 })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_EVIDENCE')
  })

  it('treats a missing source as no evidence rather than a retrieval exception', async () => {
    const { call } = setup(fixture([]))
    expect(await call('search_source', { taskId, query: 'tokenizer' })).toMatchObject({ matched: false, evidence: [] })
  })

  it.each([
    ['https://youtu.be/fixture', 'https://youtu.be/fixture?t=83'],
    ['https://www.bilibili.com/video/BVfixture', 'https://www.bilibili.com/video/BVfixture#t=83'],
  ])('formats an original-source citation for %s', async (videoUrl, expectedUrl) => {
    const data = fixture(); data.task.video_url = videoUrl
    const { call } = setup(data)
    const result = await call<EvidenceResult>('search_source', { taskId, query: 'tokenizer' })
    expect(result.evidence[0].reference.url).toBe(expectedUrl)
  })

  it('does not invent timestamps for untimed plain text', async () => {
    const data = fixture([{ id: 'script', kind: 'script', locale: null, status: 'completed', content: 'Tokenizer explanation.' }])
    data.task.video_title = null; data.task.video_url = 'https://youtu.be/fixture'
    const { call } = setup(data)
    const result = await call<EvidenceResult>('search_source', { taskId, query: 'tokenizer' })
    expect(result.evidence[0].reference).toMatchObject({ url: 'https://youtu.be/fixture', title: 'Source' })
    expect(result.evidence[0].startSeconds).toBeUndefined()
  })

  it('refuses non-HTTP source links rather than emitting an unsafe reference', async () => {
    const data = fixture(); data.task.video_url = 'javascript:alert(1)'
    const { call } = setup(data)
    await expect(call('search_source', { taskId, query: 'tokenizer' })).rejects.toThrow('Invalid source URL')
  })
})

describe('shared context budget', () => {
  it('caps summary reads at 12000 characters and total returned context at 32000', async () => {
    const data = fixture([{ id: 'summary', kind: 'summary', locale: 'zh', status: 'completed', content: summary('S'.repeat(40_000)) }])
    const { call } = setup(data)
    const returned = []
    for (let i = 0; i < 4; i++) returned.push(await call<{ summary: string; truncated: boolean }>('get_task_context', { taskId }))
    expect(returned.map(result => result.summary.length)).toEqual([12_000, 12_000, 8_000, 0])
    expect(returned.every(result => result.truncated)).toBe(true)
  })

  it('bounds public citation parts without dropping references from short-segment evidence', async () => {
    const content = JSON.stringify({ segments: Array.from({ length: 128 }, (_, index) => ({
      start: index, text: 'Evidence ' + index,
    })) })
    const onPart = vi.fn()
    const { call, bundle } = setup(fixture([
      { id: 'raw', kind: 'script_raw', locale: 'en', status: 'completed', content },
    ]), { onPart })
    const ids = buildSourceIndex(taskId, content).segments.map(segment => segment.id)
    let returned = 0
    for (let offset = 0; offset < ids.length; offset += 8) {
      const result = await call<EvidenceResult>('read_source', { taskId, segmentIds: ids.slice(offset, offset + 8) })
      returned += result.evidence.length
      expect(result.evidence.every(item => item.reference.url.includes('t='))).toBe(true)
    }
    expect(returned).toBe(128)
    expect(bundle.references.size).toBe(128)
    expect(onPart).toHaveBeenCalledTimes(48)
  })

  it('shares the summary budget with source search and leaves no evidence after exhaustion', async () => {
    const data = fixture([
      { id: 'summary', kind: 'summary', locale: 'zh', status: 'completed', content: summary('S'.repeat(40_000)) },
      { id: 'raw', kind: 'script_raw', locale: null, status: 'completed', content: raw },
    ])
    const { call } = setup(data)
    for (let i = 0; i < 3; i++) await call('get_task_context', { taskId })
    expect(await call('search_source', { taskId, query: 'tokenizer' })).toMatchObject({ evidence: [], matched: false, truncated: true, remainingCharacters: 0 })
  })

  it('marks a partial final evidence segment as truncated even if its ID remains in the result', async () => {
    const content = summary('S'.repeat(32_000))
    const boundedSummary = buildSummaryMarkdownFromContent(content, 'zh')
    expect(boundedSummary.length).toBeGreaterThan(12_000)
    const data = fixture([
      { id: 'summary', kind: 'summary', locale: 'zh', status: 'completed', content },
      { id: 'raw', kind: 'script_raw', locale: null, status: 'completed', content: JSON.stringify({ segments: [{ text: 'tokenizer '.repeat(150), start: 1 }] }) },
    ])
    const { call } = setup(data)
    await call('get_task_context', { taskId })
    await call('get_task_context', { taskId })
    // Consume 7500 of the 8000 remaining characters through five evidence reads.
    const first = await call<EvidenceResult>('search_source', { taskId, query: 'tokenizer' })
    const segmentIds = first.evidence.map(segment => segment.id)
    for (let i = 0; i < 4; i++) await call('read_source', { taskId, segmentIds })
    const partial = await call<EvidenceResult>('read_source', { taskId, segmentIds })
    expect(partial.evidence).toHaveLength(1)
    expect(partial.evidence[0].text.length).toBeLessThan(first.evidence[0].text.length)
    expect(partial.remainingCharacters).toBe(0)
    expect(partial.truncated).toBe(true)
  })

  it('chooses the completed preferred-language summary, not another locale or raw evidence', async () => {
    const { call, client } = setup(fixture([
      { id: 'en', kind: 'summary', locale: 'en', status: 'completed', content: summary('English overview') },
      { id: 'zh', kind: 'summary', locale: 'zh', status: 'completed', content: summary('中文概览') },
      { id: 'raw', kind: 'script_raw', locale: null, status: 'completed', content: raw },
    ]))
    const result = await call<{ summary: string }>('get_task_context', { taskId })
    expect(result.summary).toContain('中文概览')
    expect(result.summary).not.toContain('English overview')
    expect(result.summary).not.toContain('PRIVATE_EVIDENCE')
    expect(client.read).toHaveBeenCalledWith(taskId)
  })

  it('keeps source retrieval discoverable when no valid summary exists', async () => {
    const { call } = setup(fixture())
    expect(await call('get_task_context', { taskId })).toMatchObject({ summary: '', truncated: false, evidenceAvailable: expect.stringContaining('search_source') })
  })
})

describe('durable action receipts', () => {
  it('retains quota exhaustion after the SDK converts a thrown tool error into a tool result', async () => {
    const { call, bundle, client } = setup()
    client.submit.mockRejectedValue(new AgentServiceError(402))

    await expect(call('create_video_task', {
      videoUrl: 'https://youtu.be/fixture', locale: 'zh',
    })).rejects.toMatchObject({ status: 402 })
    expect(bundle.quotaFailure()).toMatchObject({ status: 402 })
    expect(bundle.isWaiting()).toBe(false)
  })

  it('emits a lightweight task card only after the backend confirms a waiting receipt', async () => {
    const onPart = vi.fn()
    const { call, bundle, client } = setup(undefined, { onPart })
    expect(bundle.isWaiting()).toBe(false)
    await call('create_video_task', { videoUrl: 'https://youtu.be/fixture', locale: 'en' })
    expect(client.submit).toHaveBeenCalledWith('https://youtu.be/fixture', 'en')
    expect(bundle.isWaiting()).toBe(true)
    expect(bundle.taskParts).toEqual([{ type: 'data-task-status', id: 'task-status-' + taskId, data: { taskId, status: 'pending' } }])
    expect(onPart).toHaveBeenCalledWith(bundle.taskParts[0])
  })

  it('watches a revised goal without creating another video', async () => {
    const { call, client, bundle } = setup()
    await call('continue_when_ready', { taskId })
    expect(client.watch).toHaveBeenCalledWith(taskId)
    expect(client.submit).not.toHaveBeenCalled()
    expect(bundle.isWaiting()).toBe(true)
  })

  it.each([{ taskId, waiting: false }, { waiting: true }, { taskId: 3, waiting: true }])(
    'does not manufacture a handoff from an unconfirmed response', async receipt => {
      const { call, client, bundle } = setup()
      client.submit.mockResolvedValue(receipt)
      await call('create_video_task', { videoUrl: 'https://youtu.be/fixture', locale: 'zh' })
      expect(bundle.isWaiting()).toBe(false)
      expect(bundle.taskParts).toEqual([])
    },
  )
})
