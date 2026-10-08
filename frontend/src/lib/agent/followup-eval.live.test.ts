/** Opt-in subscription evaluation; application state is mocked, not a database measurement. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentTurn, TaskData, TurnClient } from './backend'
import { resolveAgentRuntime, runTaskAgent } from './task-agent'

vi.mock('@/env', () => ({ env: {
  NODE_ENV: 'development', LLM_RUNTIME: 'codex_local', CODEX_LOCAL_TIMEOUT_SECONDS: 120,
} }))

const diagnosticCalls = vi.hoisted(() => ({ calls: [] as {
  name: string; input: unknown; outcome: 'pass' | 'fail'; error?: string
}[] }))
vi.mock('@/lib/local-codex', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/local-codex')>()
  return { ...original, runLocalCodex: (...args: Parameters<typeof original.runLocalCodex>) => {
    const [prompt, options, signal] = args
    return original.runLocalCodex(prompt, { ...options, tools: options.tools?.map(tool => ({
      ...tool, execute: async input => {
        const call: typeof diagnosticCalls.calls[number] = { name: tool.name, input, outcome: 'pass' }
        diagnosticCalls.calls.push(call)
        try { return await tool.execute(input) }
        catch (error) {
          call.outcome = 'fail'
          call.error = error instanceof Error ? error.message.slice(0, 300) : 'Unknown tool error'
          throw error
        }
      },
    })) }, signal)
  } }
})

type FollowupCase = {
  id: string; category: string; source_path: string; locale: 'en' | 'zh'; question: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

const repoRoot = path.resolve(__dirname, '../../../..')
const agentCodeHash = createHash('sha256').update(['task-agent.ts', 'tools.ts', 'source-index.ts']
  .map(file => readFileSync(path.join(__dirname, file), 'utf8')).join('\n')).digest('hex')
const dataset = JSON.parse(readFileSync(path.join(repoRoot, 'evals/followup/cases.json'), 'utf8')) as {
  version: number; cases: FollowupCase[]
}
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'evals/sprint-smoke.json'), 'utf8'))
const subset = process.env.FOLLOWUP_EVAL_CASE_IDS?.split(',').map(id => id.trim()).filter(Boolean)
const selectedIds: string[] = subset ?? (process.env.RUN_LOCAL_FOLLOWUP_FULL === '1'
  ? dataset.cases.map(item => item.id) : manifest.selection.followup)
const enabled = process.env.RUN_LOCAL_FOLLOWUP_EVAL === '1' && !process.env.CI
const cases = selectedIds.map(id => {
  const item = dataset.cases.find(candidate => candidate.id === id)
  if (!item) throw new Error(`Unknown follow-up evaluation case: ${id}`)
  return item
})
const runId = randomUUID()
const outputPath = path.resolve(repoRoot, process.env.FOLLOWUP_EVAL_OUTPUT
  ?? `output/evals/followup-${runId}.json`)
const records: unknown[] = []

function persist() {
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify({
    version: 1, run_id: runId, dataset_version: dataset.version,
    application_state: 'mocked_no_database', source_urls: 'synthetic_fixture_links',
    agent_code_sha256: agentCodeHash,
    selected_case_ids: selectedIds, results: records,
  }, null, 2) + '\n')
}

describe.skipIf(!enabled)('local follow-up dataset execution (manual verdicts required)', { concurrent: false }, () => {
  it.each(cases)('$id', async item => {
    diagnosticCalls.calls = []
    const taskId = randomUUID()
    const inputId = `eval-${item.id}`
    const turn: AgentTurn = {
      id: randomUUID(), thread_id: randomUUID(), user_id: randomUUID(),
      input_message_id: inputId, task_id: taskId, status: 'running',
      execution_token: 'fixture-only-no-database',
      runtime_config: { ...resolveAgentRuntime(item.locale), scope: 'source' },
    }
    // Feed intact source only through business tools. Ground-truth claims never enter the model prompt.
    const source = readFileSync(path.join(repoRoot, item.source_path), 'utf8')
    const data: TaskData = {
      task: { id: taskId, status: 'completed', progress: 100,
        video_title: `Evaluation fixture: ${path.basename(item.source_path)}`,
        video_url: 'https://www.youtube.com/watch?v=evalfixture', thumbnail_url: null },
      outputs: [{ id: 'fixture-source', kind: 'script_raw', locale: 'en', status: 'completed', content: source }],
    }
    const messages = [...item.history.map((message, index) => ({
      id: `${inputId}-history-${index}`, role: message.role, created_at: new Date().toISOString(),
      content: [{ type: 'text', text: message.content }],
    })), { id: inputId, role: 'user', created_at: new Date().toISOString(),
      content: [{ type: 'text', text: item.question }] }]
    const client: TurnClient = {
      history: vi.fn().mockResolvedValue({ messages }), read: vi.fn().mockResolvedValue(data),
      submit: vi.fn().mockRejectedValue(new Error('Fixture evaluation prohibits submission')),
      watch: vi.fn().mockRejectedValue(new Error('Fixture evaluation prohibits continuation')),
      finish: vi.fn().mockResolvedValue({ saved: true }),
    }
    const record = structuredClone(manifest.recording.result_template)
    Object.assign(record, { dataset: 'followup', case_id: item.id, dataset_version: dataset.version,
      run_id: runId, runtime: turn.runtime_config.runtime, provider: turn.runtime_config.provider,
      requested_model: turn.runtime_config.model, policy: item.category === 'quote_verbatim'
        ? manifest.legacy_quote_policy : null })
    const started = Date.now()
    try {
      const result = await runTaskAgent(turn, client, { signal: AbortSignal.timeout(120_000) })
      Object.assign(record, {
        answer: result.parts.filter(part => part.type === 'text').map(part => part.text).join('\n'),
        public_parts: result.parts, metadata: result.metadata, actual_model: null,
        reported_model: result.metadata.actualModel ?? null, model_identity_verified: false,
        latency_ms: result.metadata.durationMs ?? Date.now() - started,
        usage: { input_tokens: result.metadata.inputTokens ?? null, output_tokens: result.metadata.outputTokens ?? null,
          total_tokens: result.metadata.totalTokens ?? null },
      })
      expect(result.saved).toBe(true)
      expect(result.parts.every(part => ['text', 'source-url'].includes(part.type))).toBe(true)
      expect(client.finish).toHaveBeenCalledWith(result.parts, result.metadata)
      expect(client.submit).not.toHaveBeenCalled()
      expect(client.watch).not.toHaveBeenCalled()
      record.technical_checks = 'pass'
    } catch (error) {
      record.technical_checks = 'fail'
      // Keep diagnostic messages bounded; never record native tool results or raw source snapshots.
      record.error = error instanceof Error ? error.message.slice(0, 500) : 'Unknown evaluation error'
      record.latency_ms = Date.now() - started
      throw error
    } finally {
      record.tool_trace = vi.mocked(client.read).mock.calls.map(([id, includeSource]) => ({
        operation: 'read', task_id: id, include_source: includeSource ?? false,
      }))
      record.mocked_business_calls = {
        submit: vi.mocked(client.submit).mock.calls.length, watch: vi.mocked(client.watch).mock.calls.length,
        finish: vi.mocked(client.finish).mock.calls.length,
      }
      // Fixture-only arguments and errors; never store tool results or source text.
      record.tool_calls = structuredClone(diagnosticCalls.calls)
      records.push(record)
      persist()
      process.stdout.write(`FOLLOWUP_EVAL ${JSON.stringify({ case: item.id, technical: record.technical_checks,
        durationMs: record.latency_ms, output: outputPath })}\n`)
    }
  }, 150_000)
})
