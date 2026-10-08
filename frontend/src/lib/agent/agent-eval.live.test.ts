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
}[], injectionDelivered: false }))
vi.mock('@/lib/local-codex', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/local-codex')>()
  return { ...original, runLocalCodex: (...args: Parameters<typeof original.runLocalCodex>) => {
    const [prompt, options, signal] = args
    return original.runLocalCodex(prompt, { ...options, tools: options.tools?.map(tool => ({
      ...tool, execute: async input => {
        const call: typeof diagnosticCalls.calls[number] = { name: tool.name, input, outcome: 'pass' }
        diagnosticCalls.calls.push(call)
        try {
          const result = await tool.execute(input)
          if (tool.name === 'get_task_context' && JSON.stringify(result).includes('SYSTEM OVERRIDE')) {
            diagnosticCalls.injectionDelivered = true
          }
          return result
        }
        catch (error) {
          call.outcome = 'fail'
          call.error = error instanceof Error ? error.message.slice(0, 300) : 'Unknown tool error'
          throw error
        }
      },
    })) }, signal)
  } }
})

type AgentCase = {
  id: string; input: { kind: string; message_id: string; text: string | null }
  context: { scope: 'workspace' | 'source'; locale: 'en' | 'zh'; task: { id: string; status: string } | null;
    history: { id: string; role: 'user' | 'assistant'; text: string }[];
    evidence_case_ids: string[]; tool_results: { tool: string; content: string }[] }
}
const repoRoot = path.resolve(__dirname, '../../../..')
const agentCodeHash = createHash('sha256').update(['task-agent.ts', 'tools.ts', 'source-index.ts']
  .map(file => readFileSync(path.join(__dirname, file), 'utf8')).join('\n')).digest('hex')
const dataset = JSON.parse(readFileSync(path.join(repoRoot, 'evals/agent/cases.json'), 'utf8')) as { version: number; cases: AgentCase[] }
const evidence = JSON.parse(readFileSync(path.join(repoRoot, 'evals/followup/cases.json'), 'utf8')) as { cases: { id: string; source_path: string }[] }
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'evals/sprint-smoke.json'), 'utf8'))
const stateOnlyIds = ['action-duplicate-input', 'control-stale-worker-cannot-commit',
  'control-cancel-answer-only', 'control-retry-answer-not-video']
const selectedIds: string[] = process.env.AGENT_EVAL_CASE_IDS?.split(',').map(id => id.trim()).filter(Boolean)
  ?? (process.env.RUN_LOCAL_AGENT_FULL === '1' ? dataset.cases.map(item => item.id) : manifest.selection.agent)
const unobservedIds = selectedIds.filter(id => stateOnlyIds.includes(id))
const enabled = process.env.RUN_LOCAL_AGENT_EVAL === '1' && !process.env.CI
const cases = selectedIds.filter(id => !stateOnlyIds.includes(id)).map(id => {
  const item = dataset.cases.find(candidate => candidate.id === id)
  if (!item) throw new Error(`Unknown Agent evaluation case: ${id}`)
  return item
})
const runId = randomUUID()
const outputPath = path.resolve(repoRoot, process.env.AGENT_EVAL_OUTPUT
  ?? `output/evals/agent-${runId}.json`)
const records: unknown[] = unobservedIds.map(id => ({ ...structuredClone(manifest.recording.result_template),
  dataset: 'agent', case_id: id, dataset_version: dataset.version, run_id: runId,
  technical_checks: 'not_observed', reviewer_notes: ['Committed application-state evidence required; no model call.'] }))

function persist() {
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify({
    version: 1, run_id: runId, dataset_version: dataset.version,
    application_state: 'mocked_no_database', source_urls: 'synthetic_fixture_links',
    agent_code_sha256: agentCodeHash,
    selected_case_ids: selectedIds, results: records,
  }, null, 2) + '\n')
}

describe.skipIf(!enabled)('local Agent scenarios (manual model verdicts required)', { concurrent: false }, () => {
  it.each(cases)('$id', async item => {
    diagnosticCalls.calls = []
    diagnosticCalls.injectionDelivered = false
    const taskId = item.context.task?.id ?? randomUUID()
    const inputId = item.input.message_id
    const terminal = item.input.kind === 'task_terminal'
    const turn: AgentTurn = {
      id: randomUUID(), thread_id: randomUUID(), user_id: randomUUID(),
      input_message_id: inputId, task_id: item.context.task?.id ?? null, status: terminal ? 'finalizing' : 'running',
      execution_token: 'fixture-only-no-database',
      runtime_config: { ...resolveAgentRuntime(item.context.locale), scope: item.context.scope },
    }
    // Ground truth and context.facts never enter the model prompt.
    const linked = evidence.cases.find(candidate => candidate.id === item.context.evidence_case_ids[0])
    if (item.context.evidence_case_ids.length && !linked) throw new Error('Missing source fixture')
    const outputs: TaskData['outputs'] = linked ? [{ id: 'fixture-source', kind: 'script_raw', locale: 'en',
      status: 'completed', content: readFileSync(path.join(repoRoot, linked.source_path), 'utf8') }] : []
    const injection = item.context.tool_results.find(result => result.tool === 'get_task_context')
    if (injection) outputs.push({ id: 'fixture-summary', kind: 'summary', locale: item.context.locale,
      status: 'completed', content: JSON.stringify({ version: 4, language: item.context.locale,
        overview: injection.content, keypoints: [{ title: 'File system',
          detail: 'The file system is a way of context engineering.',
          evidence: 'The file system is a way of context engineering.' }], sections: [] }) })
    const data: TaskData = {
      task: { id: taskId, status: item.context.task?.status ?? 'pending',
        progress: item.context.task?.status === 'completed' ? 100 : 0,
        video_title: linked ? `Evaluation fixture: ${path.basename(linked.source_path)}` : null,
        video_url: 'https://www.youtube.com/watch?v=agent000001', thumbnail_url: null }, outputs,
    }
    const messages = item.context.history.map(message => ({ id: message.id, role: message.role,
      created_at: new Date().toISOString(), content: [{ type: 'text', text: message.text }] }))
    if (item.input.text !== null) messages.push({ id: inputId, role: 'user', created_at: new Date().toISOString(),
      content: [{ type: 'text', text: item.input.text }] })
    const client: TurnClient = {
      history: vi.fn().mockResolvedValue({ messages }), read: vi.fn().mockResolvedValue(data),
      submit: vi.fn().mockResolvedValue({ taskId, waiting: true, status: 'pending' }),
      watch: vi.fn().mockResolvedValue({ taskId, waiting: true, status: 'processing' }),
      finish: vi.fn().mockResolvedValue({ saved: true }),
    }
    const record = structuredClone(manifest.recording.result_template)
    Object.assign(record, { dataset: 'agent', case_id: item.id, dataset_version: dataset.version,
      run_id: runId, runtime: turn.runtime_config.runtime, provider: turn.runtime_config.provider,
      requested_model: turn.runtime_config.model, phase: turn.status,
      input_provenance: terminal ? 'persisted_fixture_user_history' : 'fixture_current_user_message',
      evidence_case_ids: item.context.evidence_case_ids })
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
      expect(result.parts.every(part => ['text', 'source-url', 'data-task-status'].includes(part.type))).toBe(true)
      expect(client.finish).toHaveBeenCalledWith(result.parts, result.metadata)
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
        submit: vi.mocked(client.submit).mock.calls.map(([videoUrl, locale]) => ({ video_url: videoUrl, locale })),
        watch: vi.mocked(client.watch).mock.calls.map(([id]) => ({ task_id: id })),
        finish: vi.mocked(client.finish).mock.calls.length,
      }
      // Fixture-only arguments and errors; never store tool results or source text.
      record.tool_calls = structuredClone(diagnosticCalls.calls)
      record.injection_delivered = diagnosticCalls.injectionDelivered
      records.push(record)
      persist()
      process.stdout.write(`AGENT_EVAL ${JSON.stringify({ case: item.id, technical: record.technical_checks,
        durationMs: record.latency_ms, output: outputPath })}\n`)
    }
  }, 150_000)
})
