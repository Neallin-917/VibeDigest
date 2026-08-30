import 'server-only'

import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'

import { env } from '@/env'

const MAX_OUTPUT_BYTES = 1_000_000
const MAX_TOOL_CALLS = 16

export type LocalCodexTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly?: boolean
  execute: (args: unknown) => Promise<unknown>
}

export type LocalCodexRunOptions = {
  model: string
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  instructions?: string
  tools?: LocalCodexTool[]
  onText?: (delta: string) => void
  onToolProgress?: (name: string, state: 'running' | 'finished') => void
}

export type LocalCodexRunResult = {
  text: string
  runtime: 'codex_local'
  provider: 'codex_local'
  model: string
  reasoningEffort: LocalCodexRunOptions['reasoningEffort']
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

function localCodexEnvironment(): NodeJS.ProcessEnv {
  // Inherit Codex's managed login, but never app/provider/database credentials.
  return Object.fromEntries(
    ['CODEX_HOME', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR']
      .flatMap(name => process.env[name] ? [[name, process.env[name]]] : [])
  ) as NodeJS.ProcessEnv
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isLocalCodexRuntime() {
  return env.NODE_ENV !== 'production'
    && !process.env.RAILWAY_PROJECT_ID
    && env.LLM_RUNTIME === 'codex_local'
}

function respond(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk)
    if (size > 16_000) throw new Error('Tool arguments exceed the safety limit.')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** An ephemeral tool transport, not a public API or alternate state store. */
export async function createLocalToolServer(
  tools: LocalCodexTool[],
  onProgress?: LocalCodexRunOptions['onToolProgress'],
  signal?: AbortSignal,
) {
  const token = randomBytes(32).toString('hex')
  const expected = Buffer.from('Bearer ' + token)
  const byName = new Map(tools.map(tool => [tool.name, tool]))
  if (byName.size !== tools.length) throw new Error('Duplicate local tool name.')
  let calls = 0
  const server = createServer(async (request, response) => {
    const authorization = Buffer.from(request.headers.authorization ?? '')
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      respond(response, 401, { error: 'Unauthorized' })
      return
    }
    if (signal?.aborted) {
      respond(response, 410, { error: 'This turn was cancelled.' })
      return
    }
    try {
      if (request.method === 'GET' && request.url === '/tools') {
        respond(response, 200, tools.map(({ name, description, inputSchema, readOnly }) => ({
          name, description, inputSchema,
          annotations: { readOnlyHint: readOnly ?? true, destructiveHint: false, openWorldHint: false },
        })))
        return
      }
      if (request.method !== 'POST' || request.url !== '/call') {
        respond(response, 404, { error: 'Not found' })
        return
      }
      const payload = await readBody(request)
      if (signal?.aborted) {
        respond(response, 410, { error: 'This turn was cancelled.' })
        return
      }
      const tool = isRecord(payload) && typeof payload.name === 'string' ? byName.get(payload.name) : undefined
      if (!tool || !isRecord(payload)) {
        respond(response, 400, { error: 'Unknown tool' })
        return
      }
      if (++calls > MAX_TOOL_CALLS) {
        respond(response, 200, { error: 'Tool budget exhausted. Answer from the evidence already available.' })
        return
      }
      onProgress?.(tool.name, 'running')
      try {
        respond(response, 200, await tool.execute(payload.arguments))
      } finally {
        onProgress?.(tool.name, 'finished')
      }
    } catch {
      // Do not return raw exceptions: they may contain private data or credentials.
      respond(response, 200, { error: 'The requested tool could not complete.' })
    }
  })
  server.requestTimeout = 35_000
  server.headersTimeout = 5_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not bind local tools.')
  return {
    url: 'http://127.0.0.1:' + address.port,
    token,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

export async function runLocalCodex(
  prompt: string,
  options: LocalCodexRunOptions,
  signal?: AbortSignal,
): Promise<LocalCodexRunResult> {
  if (!isLocalCodexRuntime()) {
    throw new Error('Local Codex is only available on trusted development machines.')
  }
  signal?.throwIfAborted()
  const toolServer = options.tools?.length
    ? await createLocalToolServer(options.tools, options.onToolProgress, signal)
    : undefined
  const timeoutMs = (env.CODEX_LOCAL_TIMEOUT_SECONDS ?? 120) * 1000
  // Keep the development workspace outside Turbopack's production file tracing.
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), '..')
  const runner = path.join(root, 'backend', 'scripts', 'run_local_codex_chat.py')
  try {
    return await new Promise<LocalCodexRunResult>((resolve, reject) => {
      const child = spawn('uv', ['run', '--locked', '--no-sync', 'python', runner], {
        cwd: root, env: localCodexEnvironment(), stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
      let pending = ''
      let text = ''
      let outputSize = 0
      let stderrSize = 0
      let completed: Record<string, unknown> | undefined
      let settled = false
      let forceKill: ReturnType<typeof setTimeout> | undefined

      const kill = (killSignal: NodeJS.Signals) => {
        if (!child.pid) return
        try {
          if (process.platform === 'win32') child.kill(killSignal)
          else process.kill(-child.pid, killSignal)
        } catch { /* Process group already exited. */ }
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
        if (error) {
          kill('SIGTERM')
          forceKill = setTimeout(() => kill('SIGKILL'), 2000)
          forceKill.unref()
          reject(error)
        } else {
          const usage = isRecord(completed?.usage) ? completed.usage : {}
          resolve({
            text, runtime: 'codex_local', provider: 'codex_local', model: options.model,
            reasoningEffort: options.reasoningEffort,
            usage: {
              inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined,
              outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined,
              totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined,
            },
          })
        }
      }
      const abort = () => finish(new Error('Local Codex request was cancelled.'))
      const timeout = setTimeout(
        () => finish(new Error('Local Codex exceeded the configured time limit.')), timeoutMs,
      )
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (settled) return
        outputSize += Buffer.byteLength(chunk)
        if (outputSize > MAX_OUTPUT_BYTES) {
          finish(new Error('Local Codex exceeded the output safety limit.'))
          return
        }
        pending += chunk
        try {
          let boundary: number
          while ((boundary = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, boundary)
            pending = pending.slice(boundary + 1)
            if (!line.trim()) continue
            const event: unknown = JSON.parse(line)
            if (!isRecord(event)) throw new Error('Invalid local event.')
            if (event.type === 'text' && typeof event.delta === 'string') {
              text += event.delta
              options.onText?.(event.delta)
            } else if (event.type === 'finish'
              && event.runtime === 'codex_local' && event.provider === 'codex_local'
              && event.model === options.model && event.reasoning_effort === options.reasoningEffort) {
              completed = event
            } else throw new Error('Invalid local event.')
          }
        } catch {
          finish(new Error('Local Codex returned an invalid event.'))
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderrSize += chunk.length
        if (stderrSize > MAX_OUTPUT_BYTES) finish(new Error('Local Codex exceeded the diagnostic limit.'))
      })
      child.once('error', () => finish(new Error('Could not start the local Codex runtime.')))
      child.once('close', code => {
        clearTimeout(forceKill)
        if (settled) return
        if (code !== 0 || !completed || !text.trim() || pending.trim()) {
          finish(new Error('Local Codex could not complete this request.'))
        } else finish()
      })
      child.stdin.on('error', () => finish(new Error('Could not send the local Codex request.')))
      child.stdin.end(JSON.stringify({
        prompt, model: options.model, reasoning_effort: options.reasoningEffort,
        instructions: options.instructions,
        callback_url: toolServer?.url, callback_token: toolServer?.token,
      }))
    })
  } finally {
    await toolServer?.close()
  }
}
