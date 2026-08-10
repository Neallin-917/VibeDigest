import 'server-only'

import { spawn } from 'node:child_process'
import path from 'node:path'

import { env } from '@/env'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 1_000_000

type LocalCodexResult = {
  text?: unknown
  error?: unknown
}

function localCodexEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    'CODEX_HOME',
    'HOME',
    'LANG',
    'LC_ALL',
    'PATH',
    'TMPDIR',
  ] as const

  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = process.env[name]
      return value ? [[name, value]] : []
    })
  ) as NodeJS.ProcessEnv
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isLocalCodexRuntime() {
  return env.NODE_ENV !== 'production' && env.LLM_RUNTIME === 'codex_local'
}

export async function runLocalCodex(prompt: string, signal?: AbortSignal): Promise<string> {
  if (!isLocalCodexRuntime()) {
    throw new Error('Local Codex is only available in development with LLM_RUNTIME=codex_local.')
  }

  const timeoutMs = (env.CODEX_LOCAL_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_MS / 1000) * 1000
  const runnerPath = path.resolve(process.cwd(), '..', 'backend', 'scripts', 'run_local_codex_chat.py')

  return new Promise((resolve, reject) => {
    const child = spawn('uv', ['run', 'python', runnerPath], {
      cwd: path.resolve(process.cwd(), '..'),
      env: localCodexEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      callback()
    }

    const terminate = () => {
      if (!child.killed) child.kill('SIGTERM')
    }

    const abort = () => {
      terminate()
      finish(() => reject(new Error('Local Codex request was cancelled.')))
    }

    const timeout = setTimeout(() => {
      terminate()
      finish(() => reject(new Error('Local Codex did not respond before the configured timeout.')))
    }, timeoutMs)

    signal?.addEventListener('abort', abort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.length > MAX_OUTPUT_BYTES) {
        terminate()
        finish(() => reject(new Error('Local Codex returned more output than the local safety limit.')))
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > MAX_OUTPUT_BYTES) {
        terminate()
        finish(() => reject(new Error('Local Codex returned more diagnostic output than the local safety limit.')))
      }
    })

    child.once('error', (error) => {
      finish(() => reject(new Error(`Could not start the local Codex runner: ${error.message}`)))
    })

    child.once('close', (code) => {
      if (settled) return

      if (code !== 0) {
        finish(() => reject(new Error('Local Codex could not complete this request.')))
        return
      }

      try {
        const parsed: unknown = JSON.parse(stdout)
        if (!isRecord(parsed) || typeof (parsed as LocalCodexResult).text !== 'string') {
          throw new Error('Local Codex runner returned an invalid response.')
        }
        finish(() => resolve((parsed as LocalCodexResult).text as string))
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error('Local Codex runner returned an invalid response.')))
      }
    })

    child.stdin.end(JSON.stringify({ prompt }))
  })
}
