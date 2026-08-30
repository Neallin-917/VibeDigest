import { beforeEach, describe, expect, it, vi } from 'vitest'
import { format } from 'node:util'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { APICallError, type LanguageModelV4StreamPart } from '@ai-sdk/provider'
import type { ChatUIMessage, ChatUIMessagePart, StoredChatMessageRow } from '@/lib/chat-ui'
import type { AgentTurn, TaskData, TurnClient } from './backend'
import { AgentServiceError } from './backend'
import { agentConversation, resolveAgentRuntime, runTaskAgent, TASK_AGENT_INSTRUCTIONS } from './task-agent'

const { localRuntime, localRun, providerClient, providerChat, resolveProviderMock, resolveModelMock, config } = vi.hoisted(() => ({
  localRuntime: vi.fn(), localRun: vi.fn(), providerClient: vi.fn(), providerChat: vi.fn(),
  resolveProviderMock: vi.fn(), resolveModelMock: vi.fn(),
  config: { OPENAI_BASE_URL: undefined as string | undefined, LLM_PROVIDER: 'openrouter', MODEL_ALIAS_SMART: 'fixture-smart', MODEL_ALIAS_FAST: 'fixture-fast' },
}))
vi.mock('@/env', () => ({ env: config }))
vi.mock('@/lib/local-codex', () => ({ isLocalCodexRuntime: localRuntime, runLocalCodex: localRun }))
vi.mock('@/lib/llm-config', () => ({ createProviderClient: providerClient }))
vi.mock('@/lib/llm-model-registry', () => ({ resolveProvider: resolveProviderMock, resolveProviderModel: resolveModelMock }))

const taskId = '44444444-4444-4444-8444-444444444444'
const baseTurn: AgentTurn = {
  id: '33333333-3333-4333-8333-333333333333', thread_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222', input_message_id: 'user-1', task_id: taskId,
  status: 'running', execution_token: 'server-private-execution-token',
  runtime_config: { runtime: 'api', provider: 'openrouter', model: 'fixture-smart', modelTier: 'smart', reasoningEffort: 'provider-default', locale: 'zh' },
}
const sourceData: TaskData = {
  task: { id: taskId, status: 'completed', progress: 100, video_title: 'Tokenizer', video_url: 'https://youtu.be/fixture', thumbnail_url: null },
  outputs: [{ id: 'raw-1', kind: 'script_raw', locale: null, status: 'completed', content: JSON.stringify({ segments: [
    { start: 45, text: 'PRIVATE_TRANSCRIPT_SENTINEL tokenizer merges byte pairs.' },
  ] }) }],
}
const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 7, text: 7, reasoning: undefined },
}
const textEvents = (text: string, id = 'text-1'): LanguageModelV4StreamPart[] => [
  { type: 'text-start', id }, { type: 'text-delta', id, delta: text }, { type: 'text-end', id },
]
const toolEvent = (toolName: string, input: unknown, id = 'tool-1'): LanguageModelV4StreamPart => ({
  type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(input),
})
function modelFor(steps: LanguageModelV4StreamPart[][]) {
  const model = new MockLanguageModelV4({
    modelId: 'fixture-actual-model',
    doStream: steps.map(events => ({
      stream: simulateReadableStream({
        initialDelayInMs: null, chunkDelayInMs: null,
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'response-metadata', modelId: 'fixture-actual-model' },
          ...events,
          { type: 'finish', usage, finishReason: { unified: events.some(event => event.type === 'tool-call') ? 'tool-calls' : 'stop', raw: undefined } },
        ] satisfies LanguageModelV4StreamPart[],
      }),
    })),
  })
  providerChat.mockReturnValue(model)
  return model
}
function historyRow(id: string, role: 'user' | 'assistant', content: unknown): StoredChatMessageRow {
  return { id, role, content, created_at: '2026-08-28T00:00:00Z' }
}
function clientFixture() {
  return {
    history: vi.fn<TurnClient['history']>().mockResolvedValue({ messages: [historyRow('user-1', 'user', [{ type: 'text', text: 'Explain tokenization with evidence.' }])] }),
    read: vi.fn<TurnClient['read']>().mockResolvedValue(sourceData),
    submit: vi.fn<TurnClient['submit']>().mockResolvedValue({ taskId, waiting: true, status: 'pending' }),
    watch: vi.fn<TurnClient['watch']>().mockResolvedValue({ taskId, waiting: true, status: 'processing' }),
    finish: vi.fn<TurnClient['finish']>().mockResolvedValue({ saved: true }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localRuntime.mockReturnValue(false)
  providerClient.mockReturnValue({ chat: providerChat })
  resolveProviderMock.mockReturnValue('openrouter')
  resolveModelMock.mockReturnValue('fixture-smart')
  localRun.mockReset()
})

describe('runtime configuration', () => {
  it('requires raw-source retrieval for verification and timestamp requests', () => {
    expect(TASK_AGENT_INSTRUCTIONS).toContain('search_source and read_source are mandatory before answering')
  })

  it('requires task creation for an explicit supported video-processing request', () => {
    expect(TASK_AGENT_INSTRUCTIONS).toContain('call create_video_task before writing any reply')
  })

  it('uses explicit smart-tier registry routing rather than message length', () => {
    expect(resolveAgentRuntime('ja')).toEqual({ runtime: 'api', provider: 'openrouter', model: 'fixture-smart', modelTier: 'smart', reasoningEffort: 'provider-default', locale: 'ja' })
    expect(resolveProviderMock).toHaveBeenCalledWith(undefined, 'openrouter')
    expect(resolveModelMock).toHaveBeenCalledWith('openrouter', 'smart', { smart: 'fixture-smart', fast: 'fixture-fast' })
  })

  it('keeps local subscription routing separate from hosted providers', () => {
    localRuntime.mockReturnValue(true)
    expect(resolveAgentRuntime('zh')).toMatchObject({ runtime: 'codex_local', provider: 'codex_local', reasoningEffort: 'high' })
    expect(resolveProviderMock).not.toHaveBeenCalled()
    expect(resolveModelMock).toHaveBeenCalledWith('codex_local', 'smart', expect.any(Object))
  })

  it('explicitly disables extra reasoning only for OpenAI', () => {
    resolveProviderMock.mockReturnValue('openai')
    expect(resolveAgentRuntime('en').reasoningEffort).toBe('none')
  })
})

describe('bounded conversation context', () => {
  it('retains text and confirmed task references but excludes historical private tool results', () => {
    const messages = [{
      id: 'assistant-1', role: 'assistant', parts: [
        { type: 'text', text: 'An earlier explanation.' },
        { type: 'data-task-status', data: { taskId, status: 'completed' } },
        { type: 'dynamic-tool', toolName: 'read_source', toolCallId: 'old-tool', state: 'output-available', input: {}, output: 'PRIVATE_OLD_SOURCE' },
        { type: 'source-url', sourceId: 'source-1', url: 'https://youtu.be/fixture', title: 'Source' },
      ],
    }] satisfies ChatUIMessage[]
    expect(agentConversation(messages)).toEqual([{ role: 'assistant', content: `An earlier explanation.\n[Task ${taskId}: completed]` }])
    expect(JSON.stringify(agentConversation(messages))).not.toContain('PRIVATE_OLD_SOURCE')
  })

  it('drops non-context parts and keeps at most the latest twelve messages', () => {
    const messages = Array.from({ length: 20 }, (_, index): ChatUIMessage => ({ id: String(index), role: 'user', parts: [{ type: 'text', text: 'message-' + index }] }))
    expect(agentConversation(messages)).toHaveLength(12)
    expect(agentConversation(messages)[0]).toMatchObject({ content: 'message-8' })
    expect(agentConversation([{ id: 'no-context', role: 'assistant', parts: [{ type: 'source-url', sourceId: 'ref', url: 'https://example.test' }] }])).toEqual([])
  })

  it('bounds an oversized latest message while preserving the latest question', () => {
    const message: ChatUIMessage = { id: 'large', role: 'user', parts: [{ type: 'text', text: 'Q'.repeat(40_000) }] }
    expect(agentConversation([message])[0].content).toHaveLength(30_000)
  })
})

describe('hosted Agent execution with the real SDK tool loop', () => {
  it('executes source tools internally, then streams and persists only public text and citation projections', async () => {
    const model = modelFor([
      [toolEvent('search_source', { taskId, query: 'tokenizer' })],
      [
        { type: 'reasoning-start', id: 'reason-1' },
        { type: 'reasoning-delta', id: 'reason-1', delta: 'PRIVATE_REASONING_SENTINEL' },
        { type: 'reasoning-end', id: 'reason-1' },
        ...textEvents('It combines frequent byte pairs into tokens.'),
      ],
    ])
    const client = clientFixture()
    const onText = vi.fn(), onPart = vi.fn()
    const result = await runTaskAgent(baseTurn, client, { onText, onPart })
    expect(model.doStreamCalls).toHaveLength(2)
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('PRIVATE_TRANSCRIPT_SENTINEL')
    expect(client.read).toHaveBeenCalledWith(taskId, true)
    expect(onText.mock.calls.flat().join('')).toBe('It combines frequent byte pairs into tokens.')
    expect(result.parts).toEqual([
      { type: 'text', text: 'It combines frequent byte pairs into tokens.' },
      { type: 'source-url', sourceId: expect.any(String), title: 'Tokenizer · 0:45', url: 'https://youtu.be/fixture?t=45' },
    ])
    for (const publicOutput of [result.parts, onPart.mock.calls, onText.mock.calls, client.finish.mock.calls]) {
      expect(JSON.stringify(publicOutput)).not.toContain('PRIVATE_TRANSCRIPT_SENTINEL')
      expect(JSON.stringify(publicOutput)).not.toContain('PRIVATE_REASONING_SENTINEL')
      expect(JSON.stringify(publicOutput)).not.toContain(baseTurn.execution_token)
    }
    expect(result.metadata).toMatchObject({ runtime: 'api', provider: 'openrouter', model: 'fixture-smart', actualModel: 'fixture-actual-model', inputTokens: 24, outputTokens: 14, totalTokens: 38 })
    expect(client.finish).toHaveBeenCalledExactlyOnceWith(result.parts, result.metadata)
  })

  it('stops after an accepted action, without another model turn or an invented answer', async () => {
    const model = modelFor([[toolEvent('create_video_task', { videoUrl: 'https://youtu.be/fixture', locale: 'en' })]])
    const client = clientFixture()
    const result = await runTaskAgent(baseTurn, client)
    expect(model.doStreamCalls).toHaveLength(1)
    expect(client.submit).toHaveBeenCalledExactlyOnceWith('https://youtu.be/fixture', 'en')
    expect(result).toMatchObject({ waiting: true, saved: true, parts: [{ type: 'data-task-status', data: { taskId, status: 'pending' } }] })
  })

  it('allows a read-only finalizer to answer the latest goal and omits all action tools', async () => {
    const model = modelFor([textEvents('Here is the requested comparison.')])
    const result = await runTaskAgent({ ...baseTurn, status: 'finalizing' }, clientFixture())
    const options = model.doStreamCalls[0]
    expect(options.tools?.map(tool => tool.name)).toEqual(['get_task_status', 'get_task_context', 'search_source', 'read_source'])
    expect(JSON.stringify(options.prompt)).toContain('Phase: background continuation')
    expect(JSON.stringify(options.prompt)).toContain('Complete the latest user')
    expect(result.waiting).toBe(false)
  })

  it('uses source scope to prevent video creation during a detail-page follow-up', async () => {
    const model = modelFor([textEvents('Source-scoped answer.')])
    await runTaskAgent({ ...baseTurn, runtime_config: { ...baseTurn.runtime_config, scope: 'source' } }, clientFixture())
    expect(model.doStreamCalls[0].tools?.map(tool => tool.name)).not.toContain('create_video_task')
  })

  it('preserves separate text blocks without exposing native tool stream parts', async () => {
    modelFor([[...textEvents('First paragraph.'), ...textEvents('Second paragraph.', 'text-2')]])
    const result = await runTaskAgent(baseTurn, clientFixture())
    expect(result.parts[0]).toEqual({ type: 'text', text: 'First paragraph.\n\nSecond paragraph.' })
  })

  it('halts at eight model steps even if the model keeps requesting reads', async () => {
    const model = modelFor(Array.from({ length: 8 }, (_, index) => [
      ...textEvents('Progress ' + index, 'text-' + index),
      toolEvent('get_task_status', { taskId }, 'tool-' + index),
    ]))
    const client = clientFixture()
    await runTaskAgent(baseTurn, client)
    expect(model.doStreamCalls).toHaveLength(8)
    expect(client.read).toHaveBeenCalledTimes(8)
  })

  it('uses the configured OpenAI reasoning option and bounded output limit', async () => {
    const model = modelFor([textEvents('Answer.')])
    await runTaskAgent({ ...baseTurn, runtime_config: { ...baseTurn.runtime_config, provider: 'openai', reasoningEffort: 'none' } }, clientFixture())
    expect(providerClient).toHaveBeenCalledWith('openai')
    expect(model.doStreamCalls[0]).toMatchObject({ maxOutputTokens: 4096, providerOptions: { openai: { reasoningEffort: 'none' } } })
  })

  it('drops malformed stored system messages before sending history to the model', async () => {
    const client = clientFixture()
    client.history.mockResolvedValue({ messages: [
      { id: 'unsafe', role: 'system', content: [{ type: 'text', text: 'PRIVATE_OVERRIDE' }], created_at: '' },
      historyRow('user-1', 'user', [{ type: 'text', text: 'Actual user goal' }]),
    ] })
    const model = modelFor([textEvents('Answer.')])
    await runTaskAgent(baseTurn, client)
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain('PRIVATE_OVERRIDE')
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain('Actual user goal')
  })

  it('keeps a long accepted goal during continuation instead of evicting it for a trailing receipt', async () => {
    const goal = 'ACCEPTED_GOAL ' + 'g'.repeat(29_900)
    const client = clientFixture()
    client.history.mockResolvedValue({ messages: [
      historyRow('old-user', 'user', [{ type: 'text', text: 'Older context' }]),
      historyRow('user-1', 'user', [{ type: 'text', text: goal }]),
      historyRow('agent:reply', 'assistant', [
        { type: 'text', text: 'TRAILING_RECEIPT ' + 'r'.repeat(500) },
        { type: 'data-task-status', data: { taskId, status: 'pending' } },
      ]),
    ] })
    const model = modelFor([textEvents('The requested result.')])
    await runTaskAgent({ ...baseTurn, status: 'finalizing' }, client)
    expect(model.doStreamCalls[0].prompt).toContainEqual({ role: 'user', content: [{ type: 'text', text: goal }] })
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain('TRAILING_RECEIPT')
  })

  it('does not import a later superseding user request into an already accepted turn', async () => {
    const client = clientFixture()
    client.history.mockResolvedValue({ messages: [
      historyRow('user-1', 'user', [{ type: 'text', text: 'Accepted goal' }]),
      historyRow('user-2', 'user', [{ type: 'text', text: 'LATER_SUPERSEDING_GOAL' }]),
    ] })
    const model = modelFor([textEvents('Answer.')])
    await runTaskAgent(baseTurn, client)
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain('Accepted goal')
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain('LATER_SUPERSEDING_GOAL')
  })

  it('identifies the lack of a current task for a new workspace conversation', async () => {
    const model = modelFor([textEvents('Which source should I help with?')])
    await runTaskAgent({ ...baseTurn, task_id: null }, clientFixture())
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain('Current task: none.')
  })
})

describe('completion fencing and failures', () => {
  it('does not claim completion if the durable save rejects a stale execution token', async () => {
    modelFor([textEvents('Stale answer.')])
    const client = clientFixture(); client.finish.mockResolvedValue({ saved: false })
    await expect(runTaskAgent(baseTurn, client)).rejects.toMatchObject({ status: 409 })
    expect(client.finish).toHaveBeenCalledTimes(2)
    expect(client.finish.mock.calls[1]).toMatchObject([[], expect.any(Object), 'model_unavailable'])
  })

  it('accepts a fenced foreground acknowledgement when the task receipt is already durable', async () => {
    modelFor([[toolEvent('create_video_task', { videoUrl: 'https://youtu.be/fixture', locale: 'zh' })]])
    const client = clientFixture(); client.finish.mockResolvedValue({ saved: false })
    await expect(runTaskAgent(baseTurn, client)).resolves.toMatchObject({ waiting: true, saved: false })
    expect(client.finish).toHaveBeenCalledTimes(1)
  })

  it('fails a model response containing no public answer or receipt', async () => {
    modelFor([[]])
    const client = clientFixture()
    await expect(runTaskAgent(baseTurn, client)).rejects.toThrow('no public answer or receipt')
    expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'model_unavailable')
  })

  it('records failure without persisting partial model text', async () => {
    modelFor([[...textEvents('Unfinished text.'), { type: 'error', error: new Error('private upstream failure') }]])
    const client = clientFixture()
    await expect(runTaskAgent(baseTurn, client)).rejects.toThrow('Agent provider request failed')
    expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'model_unavailable')
  })

  it('records quota exhaustion as an expected commercial state', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const model = modelFor([[toolEvent('create_video_task', {
        videoUrl: 'https://youtu.be/fixture', locale: 'zh',
      })]])
      const client = clientFixture()
      client.submit.mockRejectedValue(new AgentServiceError(402))
      await expect(runTaskAgent(baseTurn, client)).rejects.toMatchObject({ status: 402 })
      expect(model.doStreamCalls).toHaveLength(1)
      expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'quota_exceeded')
      expect(log).toHaveBeenCalledWith('[Task Agent] run failed', {
        turnId: baseTurn.id, runtime: 'api', provider: 'openrouter', errorKind: 'state', statusCode: 402,
      })
    } finally {
      log.mockRestore()
    }
  })

  it.each(['request', 'stream'])('redacts %s failures before the real SDK logs them, while preserving the status', async phase => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const failure = new APICallError({
        message: 'PRIVATE provider failure', url: 'https://provider.test/PRIVATE', statusCode: 403,
        requestBodyValues: { messages: ['PRIVATE user goal and transcript'] },
        responseHeaders: { 'set-cookie': 'PRIVATE cookie' }, responseBody: 'PRIVATE provider body',
        cause: new Error('PRIVATE nested failure'),
      })
      if (phase === 'request') {
        providerChat.mockReturnValue(new MockLanguageModelV4({ doStream: async () => { throw failure } }))
      } else {
        modelFor([[{ type: 'error', error: failure }]])
      }
      const client = clientFixture()
      await expect(runTaskAgent(baseTurn, client)).rejects.toMatchObject({
        message: 'Agent provider request failed', statusCode: 403,
      })
      expect(log).toHaveBeenCalledWith('[Task Agent] run failed', {
        turnId: baseTurn.id, runtime: 'api', provider: 'openrouter', errorKind: 'inference', statusCode: 403,
      })
      expect(log.mock.calls.map(args => format(...args)).join('\n')).not.toContain('PRIVATE')
      expect(JSON.stringify(client.finish.mock.calls)).not.toContain('PRIVATE')
      expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'model_unavailable')
    } finally {
      log.mockRestore()
    }
  })

  it('preserves the original error if both saving and error recording fail', async () => {
    modelFor([textEvents('Answer.')])
    const client = clientFixture()
    const failure = new Error('save failed')
    client.finish.mockRejectedValue(failure)
    await expect(runTaskAgent(baseTurn, client)).rejects.toBe(failure)
    expect(client.finish).toHaveBeenCalledTimes(2)
  })

  it('fails closed before execution when the requested runtime does not match this server', async () => {
    const client = clientFixture()
    await expect(runTaskAgent({ ...baseTurn, runtime_config: { ...baseTurn.runtime_config, runtime: 'codex_local', provider: 'codex_local' } }, client)).rejects.toBeInstanceOf(AgentServiceError)
    expect(client.history).not.toHaveBeenCalled()
    expect(providerClient).not.toHaveBeenCalled()
    expect(localRun).not.toHaveBeenCalled()
    expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'model_unavailable')
  })

  it('records a history-loading failure instead of leaving the accepted turn running', async () => {
    const client = clientFixture()
    const failure = new Error('history unavailable')
    client.history.mockRejectedValue(failure)
    await expect(runTaskAgent(baseTurn, client)).rejects.toBe(failure)
    expect(providerClient).not.toHaveBeenCalled()
    expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'model_unavailable')
  })

  it.each(['missing', 'assistant'])('rejects a %s accepted input instead of answering an unrelated history', async kind => {
    const client = clientFixture()
    client.history.mockResolvedValue({ messages: kind === 'missing' ? [] : [historyRow('user-1', 'assistant', [{ type: 'text', text: 'Not an accepted user goal' }])] })
    await expect(runTaskAgent(baseTurn, client)).rejects.toMatchObject({ status: 409 })
    expect(providerClient).not.toHaveBeenCalled()
    expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'model_unavailable')
  })
})

describe('official local Codex execution boundary', () => {
  function localTurn(): AgentTurn {
    localRuntime.mockReturnValue(true)
    return { ...baseTurn, runtime_config: { ...baseTurn.runtime_config, runtime: 'codex_local', provider: 'codex_local', reasoningEffort: 'high' } }
  }

  it('passes only the scoped business tools and streams through the same public callbacks', async () => {
    localRun.mockImplementation(async (_prompt, options) => {
      options.onText('Local '); options.onText('answer.')
      return { text: 'Local answer.', model: 'fixture-local-actual', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }
    })
    const onText = vi.fn()
    const client = clientFixture()
    const result = await runTaskAgent(localTurn(), client, { onText })
    const [prompt, options] = localRun.mock.calls[0]
    expect(prompt).toContain('USER:\nExplain tokenization with evidence.')
    expect(prompt).not.toContain(baseTurn.execution_token)
    expect(options).toMatchObject({ model: 'fixture-smart', reasoningEffort: 'high', instructions: expect.stringContaining('Current task: ' + taskId) })
    expect(options.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_task_status', 'get_task_context', 'search_source', 'read_source', 'create_video_task', 'continue_when_ready'])
    expect(result.parts).toEqual([{ type: 'text', text: 'Local answer.' }])
    expect(result.metadata).toMatchObject({ runtime: 'codex_local', provider: 'codex_local', actualModel: 'fixture-local-actual', inputTokens: 10, outputTokens: 5, totalTokens: 15 })
    expect(onText.mock.calls).toEqual([['Local '], ['answer.']])
    expect(providerClient).not.toHaveBeenCalled()
  })

  it('preserves source-only public projections for local tools too', async () => {
    localRun.mockImplementation(async (_prompt, options) => {
      const tool = options.tools.find((item: { name: string }) => item.name === 'search_source')
      const evidence = await tool.execute({ taskId, query: 'tokenizer' })
      expect(JSON.stringify(evidence)).toContain('PRIVATE_TRANSCRIPT_SENTINEL')
      options.onText('A grounded paraphrase.')
      return { text: 'A grounded paraphrase.', usage: {} }
    })
    const parts: ChatUIMessagePart[] = []
    const client = clientFixture()
    const result = await runTaskAgent(localTurn(), client, { onPart: part => parts.push(part) })
    expect(parts).toHaveLength(1)
    expect(parts[0].type).toBe('source-url')
    expect(JSON.stringify(result.parts)).not.toContain('PRIVATE_TRANSCRIPT_SENTINEL')
    expect(JSON.stringify(client.finish.mock.calls)).not.toContain('PRIVATE_TRANSCRIPT_SENTINEL')
  })

  it('records cancellation without switching to a paid hosted provider', async () => {
    const controller = new AbortController()
    const failure = new Error('local cancelled')
    localRun.mockImplementation(async () => { controller.abort(); throw failure })
    const client = clientFixture()
    await expect(runTaskAgent(localTurn(), client, { signal: controller.signal })).rejects.toBe(failure)
    expect(localRun.mock.calls[0][2]).toBe(controller.signal)
    expect(client.finish).toHaveBeenCalledExactlyOnceWith([], expect.any(Object), 'cancelled')
    expect(providerClient).not.toHaveBeenCalled()
  })
})
