/** Synthetic instruction-transport probe, not a source or business-quality benchmark. */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runLocalCodex } from '@/lib/local-codex'
import { resolveAgentRuntime } from './task-agent'

vi.mock('@/env', () => ({ env: {
  NODE_ENV: 'development', LLM_RUNTIME: 'codex_local', CODEX_LOCAL_TIMEOUT_SECONDS: 120,
} }))

const enabled = process.env.RUN_LOCAL_INSTRUCTION_PROBE === '1' && !process.env.CI
const repoRoot = path.resolve(__dirname, '../../../..')

describe.skipIf(!enabled)('synthetic local instruction transport probe', () => {
  it('applies explicit instructions without tools', async () => {
    const runtime = resolveAgentRuntime('en')
    const runId = randomUUID()
    const outputPath = path.resolve(repoRoot, process.env.INSTRUCTION_PROBE_OUTPUT
      ?? `output/evals/instruction-probe-${runId}.json`)
    const prompt = 'Explain what t=90 means in a video URL.'
    const instructions = 'You are a test assistant. Answer only with INSTRUCTION_APPLIED_EN. Do not explain or use any tool.'
    const record: Record<string, unknown> = {
      version: 1, run_id: runId, purpose: 'synthetic_instruction_transport_probe',
      input_syntax: { prompt, instructions, tools: [] },
      runtime: runtime.runtime, provider: runtime.provider, requested_model: runtime.model,
      actual_model: null, model_identity_verified: false, technical_checks: 'not_observed',
    }
    const started = Date.now()
    try {
      const result = await runLocalCodex(prompt, {
        model: runtime.model, reasoningEffort: 'high', instructions,
      }, AbortSignal.timeout(120_000))
      Object.assign(record, { answer: result.text, reported_model: result.model,
        metadata: { runtime: result.runtime, provider: result.provider,
          reasoning_effort: result.reasoningEffort },
        usage: { input_tokens: result.usage?.inputTokens ?? null,
          output_tokens: result.usage?.outputTokens ?? null,
          total_tokens: result.usage?.totalTokens ?? null } })
      expect(result.text.trim()).toBe('INSTRUCTION_APPLIED_EN')
      record.technical_checks = 'pass'
    } catch (error) {
      record.technical_checks = 'fail'
      record.error = error instanceof Error ? error.message.slice(0, 500) : 'Unknown probe error'
      throw error
    } finally {
      record.latency_ms = Date.now() - started
      mkdirSync(path.dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n')
      process.stdout.write(`INSTRUCTION_PROBE ${JSON.stringify({ technical: record.technical_checks,
        durationMs: record.latency_ms, output: outputPath })}\n`)
    }
  }, 150_000)
})
