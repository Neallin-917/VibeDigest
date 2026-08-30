/** Opt-in subscription smoke. CI always skips it; all application data is synthetic. */
import { expect, it, vi } from 'vitest'
import { resolveAgentRuntime, runTaskAgent } from './task-agent'
import type { AgentTurn, TaskData, TurnClient } from './backend'

vi.mock('@/env', () => ({ env: {
  NODE_ENV: 'development', LLM_RUNTIME: 'codex_local', CODEX_LOCAL_TIMEOUT_SECONDS: 120,
} }))

it.skipIf(process.env.RUN_LOCAL_AGENT_SMOKE !== '1' || Boolean(process.env.CI))(
  'runs the official Codex SDK through the actual task Agent tools and public stream projection',
  async () => {
    const taskId = '44444444-4444-4444-8444-444444444444'
    const turn: AgentTurn = {
      id: '33333333-3333-4333-8333-333333333333', thread_id: '11111111-1111-4111-8111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222', input_message_id: 'smoke-user', task_id: taskId,
      status: 'finalizing', execution_token: 'fixture-only-no-database',
      runtime_config: { ...resolveAgentRuntime('en'), scope: 'source' },
    }
    const data: TaskData = {
      task: { id: taskId, status: 'completed', progress: 100, video_title: 'Synthetic batching fixture', video_url: 'https://www.youtube.com/watch?v=synthetic-fixture', thumbnail_url: null },
      outputs: [{ id: 'raw-fixture', kind: 'script_raw', locale: 'en', status: 'completed', content: JSON.stringify({ segments: [
        { start: 15, text: 'We compared memory use in a small example.' },
        { start: 45, text: 'For this fixture, the recommended batch size is 37 because larger batches exceed the memory limit. INTERNAL_MARKER_DO_NOT_COPY.' },
      ] }) }],
    }
    const client: TurnClient = {
      history: vi.fn().mockResolvedValue({ messages: [{ id: 'smoke-user', role: 'user', created_at: new Date().toISOString(), content: [{ type: 'text', text: 'What batch size does this source recommend, and why? Verify against source evidence and cite its timestamp. Use one short sentence.' }] }] }),
      read: vi.fn().mockResolvedValue(data), submit: vi.fn(), watch: vi.fn(), finish: vi.fn().mockResolvedValue({ saved: true }),
    }
    const deltas: string[] = []
    const result = await runTaskAgent(turn, client, { onText: delta => deltas.push(delta) })
    expect(client.read).toHaveBeenCalledWith(taskId, true)
    expect(client.submit).not.toHaveBeenCalled()
    expect(client.watch).not.toHaveBeenCalled()
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas.join('')).toContain('37')
    expect(JSON.stringify(result.parts)).not.toContain('INTERNAL_MARKER_DO_NOT_COPY')
    expect(result.parts.some(part => part.type === 'source-url' && part.url.includes('t=45'))).toBe(true)
    expect(result.parts.every(part => ['text', 'source-url'].includes(part.type))).toBe(true)
    expect(client.finish).toHaveBeenCalledWith(result.parts, result.metadata)
    process.stdout.write('LOCAL_AGENT_SMOKE ' + JSON.stringify({ model: result.metadata.actualModel, toolReads: vi.mocked(client.read).mock.calls.length, chunks: deltas.length, durationMs: result.metadata.durationMs, inputTokens: result.metadata.inputTokens, outputTokens: result.metadata.outputTokens }) + '\n')
  }, 150_000,
)
