import { EventEmitter } from 'node:events'
import { IncomingMessage, Server, request as httpRequest } from 'node:http'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock, mockEnv } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  mockEnv: {
    NODE_ENV: 'development',
    LLM_RUNTIME: 'codex_local',
    CODEX_LOCAL_TIMEOUT_SECONDS: 120,
  },
}))

vi.mock('node:child_process', () => ({ spawn: spawnMock, default: { spawn: spawnMock } }))
vi.mock('@/env', () => ({ env: mockEnv }))

import {
  createLocalToolServer,
  runLocalCodex,
  type LocalCodexRunOptions,
  type LocalCodexTool,
} from './local-codex'

type ToolServer = Awaited<ReturnType<typeof createLocalToolServer>>
type HttpResult = { status: number; body: string; headers: IncomingMessage['headers'] }

const servers: ToolServer[] = []
const children: ReturnType<typeof mockChild>[] = []

function fixtureTool(execute: LocalCodexTool['execute'] = vi.fn(async () => ({ found: true }))): LocalCodexTool {
  return {
    name: 'read_source',
    description: 'Read a known source reference.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    execute,
  }
}

async function startToolServer(
  tools: LocalCodexTool[],
  onProgress?: LocalCodexRunOptions['onToolProgress'],
  signal?: AbortSignal,
) {
  const server = await createLocalToolServer(tools, onProgress, signal)
  servers.push(server)
  return server
}

function startRequest(
  server: Pick<ToolServer, 'url' | 'token'>,
  pathname: string,
  method = 'GET',
  token: string | undefined = server.token,
  headers: Record<string, string> = {},
) {
  let request: ReturnType<typeof httpRequest>
  const response = new Promise<HttpResult>((resolve, reject) => {
    request = httpRequest(new URL(pathname, server.url), {
      method,
      headers: {
        Connection: 'close',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    }, incoming => {
      const chunks: Buffer[] = []
      incoming.on('data', chunk => chunks.push(Buffer.from(chunk)))
      incoming.once('end', () => resolve({
        status: incoming.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
        headers: incoming.headers,
      }))
      incoming.once('error', reject)
    })
    request.once('error', reject)
    request.setTimeout(2_000, () => request.destroy(new Error('Test HTTP request timed out.')))
  })
  return { request: request!, response }
}

function sendRequest(
  server: Pick<ToolServer, 'url' | 'token'>,
  pathname: string,
  method = 'GET',
  body?: string,
  token: string | undefined = server.token,
) {
  const pending = startRequest(server, pathname, method, token)
  pending.request.end(body)
  return pending.response
}

function callTool(server: ToolServer, name = 'read_source', args: unknown = { id: 'source-1' }) {
  return sendRequest(server, '/call', 'POST', JSON.stringify({ name, arguments: args }))
}

function mockChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: 999_999,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  return child
}

const options: LocalCodexRunOptions = { model: 'test-model', reasoningEffort: 'high' }

function completion(overrides: Record<string, unknown> = {}) {
  return {
    type: 'finish',
    runtime: 'codex_local',
    provider: 'codex_local',
    model: options.model,
    reasoning_effort: options.reasoningEffort,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    ...overrides,
  }
}

function prepareChild() {
  const child = mockChild()
  children.push(child)
  spawnMock.mockReturnValue(child)
  return child
}

function writeEvents(child: ReturnType<typeof mockChild>, ...events: unknown[]) {
  child.stdout.write(events.map(event => JSON.stringify(event)).join('\n') + '\n')
}

beforeEach(() => {
  spawnMock.mockReset()
  mockEnv.NODE_ENV = 'development'
  mockEnv.LLM_RUNTIME = 'codex_local'
  mockEnv.CODEX_LOCAL_TIMEOUT_SECONDS = 120
  vi.stubEnv('RAILWAY_PROJECT_ID', '')
  // No test may signal a real process, including a failure-cleanup path.
  vi.spyOn(process, 'kill').mockReturnValue(true)
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  for (const child of children.splice(0)) {
    child.emit('close', 0)
    child.stdin.destroy()
    child.stdout.destroy()
    child.stderr.destroy()
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('createLocalToolServer', () => {
  it('binds an ephemeral listener only to 127.0.0.1', async () => {
    const listen = vi.spyOn(Server.prototype, 'listen')
    const server = await startToolServer([fixtureTool()])
    expect(listen).toHaveBeenCalledWith(0, '127.0.0.1', expect.any(Function))
    expect(new URL(server.url).hostname).toBe('127.0.0.1')
    expect(Number(new URL(server.url).port)).toBeGreaterThan(0)
    expect(server.token).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each(['missing', 'different-length', 'same-length'])('denies a %s token before listing or running tools', async kind => {
    const execute = vi.fn(async () => ({ found: true }))
    const server = await startToolServer([fixtureTool(execute)])
    const token = kind === 'missing' ? '' : kind === 'different-length' ? 'wrong' : 'z'.repeat(64)
    const listed = await sendRequest(server, '/tools', 'GET', undefined, token)
    const called = await sendRequest(server, '/call', 'POST', JSON.stringify({ name: 'read_source' }), token)
    expect(listed.status).toBe(401)
    expect(called.status).toBe(401)
    expect(JSON.parse(called.body)).toEqual({ error: 'Unauthorized' })
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([undefined, true, false])('lists schemas and explicit MCP annotations for readOnly=%s without execution functions', async readOnly => {
    const execute = vi.fn(async () => ({ privateRuntimeValue: 'not-a-schema' }))
    const tool = { ...fixtureTool(execute), readOnly }
    const server = await startToolServer([tool])
    const result = await sendRequest(server, '/tools')
    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(result.body)).toEqual([{
      name: tool.name, description: tool.description, inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: readOnly ?? true, destructiveHint: false, openWorldHint: false },
    }])
    expect(result.body).not.toContain('execute')
    expect(result.body).not.toContain('privateRuntimeValue')
    expect(execute).not.toHaveBeenCalled()
  })

  it('executes only named tools with bounded arguments and progress events', async () => {
    const execute = vi.fn(async (args: unknown) => ({ received: args }))
    const progress = vi.fn()
    const server = await startToolServer([fixtureTool(execute)], progress)
    const result = await callTool(server)
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ received: { id: 'source-1' } })
    expect(execute).toHaveBeenCalledExactlyOnceWith({ id: 'source-1' })
    expect(progress.mock.calls).toEqual([['read_source', 'running'], ['read_source', 'finished']])
  })

  it('rejects unknown tools, malformed bodies and oversized UTF-8 arguments without executing', async () => {
    const execute = vi.fn(async () => ({ found: true }))
    const server = await startToolServer([fixtureTool(execute)])
    const unknown = await callTool(server, 'shell_exec')
    const malformed = await sendRequest(server, '/call', 'POST', '{not-json')
    const oversized = await callTool(server, 'read_source', { id: '中'.repeat(6_000) })
    expect(unknown.status).toBe(400)
    expect(JSON.parse(unknown.body)).toEqual({ error: 'Unknown tool' })
    expect(JSON.parse(malformed.body)).toEqual({ error: 'The requested tool could not complete.' })
    expect(JSON.parse(oversized.body)).toEqual({ error: 'The requested tool could not complete.' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects unexpected routes or HTTP methods', async () => {
    const server = await startToolServer([fixtureTool()])
    for (const [pathname, method] of [['/unknown', 'GET'], ['/call', 'GET'], ['/tools', 'POST']]) {
      expect((await sendRequest(server, pathname, method)).status).toBe(404)
    }
  })

  it('never executes more than 16 tool calls, including concurrent requests', async () => {
    const execute = vi.fn(async () => ({ found: true }))
    const server = await startToolServer([fixtureTool(execute)])
    const results = await Promise.all(Array.from({ length: 20 }, () => callTool(server)))
    expect(execute).toHaveBeenCalledTimes(16)
    expect(results.filter(({ body }) => JSON.parse(body).error)).toHaveLength(4)
    expect(results.filter(({ body }) => JSON.parse(body).found)).toHaveLength(16)
    expect(JSON.parse((await callTool(server)).body).error).toMatch(/budget exhausted/i)
    expect(execute).toHaveBeenCalledTimes(16)
  })

  it('sanitizes tool exceptions and still closes the progress interval', async () => {
    const execute = vi.fn(async () => { throw new Error('PRIVATE_DATABASE_PASSWORD=test-only-secret') })
    const progress = vi.fn()
    const server = await startToolServer([fixtureTool(execute)], progress)
    const response = await callTool(server)
    expect(JSON.parse(response.body)).toEqual({ error: 'The requested tool could not complete.' })
    expect(response.body).not.toContain('test-only-secret')
    expect(progress.mock.calls).toEqual([['read_source', 'running'], ['read_source', 'finished']])
  })

  it('counts failed tool executions toward the same per-turn budget', async () => {
    const execute = vi.fn(async () => { throw new Error('Temporary tool failure.') })
    const server = await startToolServer([fixtureTool(execute)])
    await Promise.all(Array.from({ length: 16 }, () => callTool(server)))
    expect(JSON.parse((await callTool(server)).body).error).toMatch(/budget exhausted/i)
    expect(execute).toHaveBeenCalledTimes(16)
  })

  it('invalidates an aborted turn token before subsequent tool execution', async () => {
    const controller = new AbortController()
    const execute = vi.fn(async () => ({ found: true }))
    const server = await startToolServer([fixtureTool(execute)], undefined, controller.signal)
    controller.abort()
    const result = await callTool(server)
    expect(result.status).toBe(410)
    expect(JSON.parse(result.body)).toEqual({ error: 'This turn was cancelled.' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not execute a tool when cancellation occurs while its body is still being read', async () => {
    const controller = new AbortController()
    const execute = vi.fn(async () => ({ found: true }))
    const server = await startToolServer([fixtureTool(execute)], undefined, controller.signal)
    const bodyReader = vi.spyOn(IncomingMessage.prototype, Symbol.asyncIterator)
    const pending = startRequest(server, '/call', 'POST')
    pending.request.write('{"name":"read_source","arguments":')
    await vi.waitFor(() => expect(bodyReader).toHaveBeenCalled())
    controller.abort()
    pending.request.end('{"id":"source-1"}}')
    const response = await pending.response
    expect(execute).not.toHaveBeenCalled()
    expect(response.status).toBe(410)
  })

  it('rejects duplicate tool names instead of silently replacing a capability', async () => {
    await expect(createLocalToolServer([fixtureTool(), fixtureTool()])).rejects.toThrow('Duplicate local tool name.')
  })

  it('closes its listener and rejects subsequent connections', async () => {
    const server = await startToolServer([fixtureTool()])
    expect((await sendRequest(server, '/tools')).status).toBe(200)
    await server.close()
    await expect(sendRequest(server, '/tools')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('closes a connection that has not finished sending its tool arguments', async () => {
    const execute = vi.fn(async () => ({ found: true }))
    const server = await startToolServer([fixtureTool(execute)])
    const bodyReader = vi.spyOn(IncomingMessage.prototype, Symbol.asyncIterator)
    const pending = startRequest(server, '/call', 'POST')
    const rejected = expect(pending.response).rejects.toMatchObject({ code: 'ECONNRESET' })
    pending.request.write('{"name":"read_source","arguments":')
    await vi.waitFor(() => expect(bodyReader).toHaveBeenCalled())
    await server.close()
    await rejected
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('runLocalCodex', () => {
  it('streams valid NDJSON text across split chunks and returns validated usage metadata', async () => {
    const child = prepareChild()
    const onText = vi.fn()
    const pending = runLocalCodex('Read this source.', { ...options, onText })
    child.stdout.write('{"type":"text","delta":"Hel')
    child.stdout.write('lo"}\n\n')
    writeEvents(child, { type: 'text', delta: ' world.' }, completion())
    child.emit('close', 0)
    await expect(pending).resolves.toEqual({
      text: 'Hello world.', runtime: 'codex_local', provider: 'codex_local',
      model: options.model, reasoningEffort: 'high',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    })
    expect(onText.mock.calls).toEqual([['Hello'], [' world.']])
    expect(process.kill).not.toHaveBeenCalled()
  })

  it.each([
    ['non-object', 'null\n'],
    ['malformed JSON', '{broken}\n'],
    ['unknown event', '{"type":"other"}\n'],
    ['invalid text', '{"type":"text","delta":42}\n'],
    ['wrong model', JSON.stringify(completion({ model: 'different-model' })) + '\n'],
    ['wrong runtime', JSON.stringify(completion({ runtime: 'api' })) + '\n'],
    ['wrong provider', JSON.stringify(completion({ provider: 'openrouter' })) + '\n'],
    ['wrong reasoning effort', JSON.stringify(completion({ reasoning_effort: 'low' })) + '\n'],
  ])('rejects %s events without forwarding private diagnostics', async (_label, event) => {
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('Local Codex returned an invalid event.')
    child.stdout.write(event)
    child.emit('close', 1)
    await rejected
    expect(process.kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
  })

  it('rejects oversized output even without a complete NDJSON line', async () => {
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('output safety limit')
    child.stdout.write('x'.repeat(1_000_001))
    child.emit('close', 1)
    await rejected
  })

  it('rejects oversized stderr without exposing its contents', async () => {
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('Local Codex exceeded the diagnostic limit.')
    child.stderr.write(Buffer.from('PRIVATE'.repeat(150_000)))
    child.emit('close', 1)
    await rejected
  })

  it('rejects a partial final event instead of accepting a truncated stream', async () => {
    vi.useFakeTimers()
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('could not complete')
    writeEvents(child, { type: 'text', delta: 'Answer' }, completion())
    child.stdout.write('{"type":"text"')
    child.emit('close', 0)
    await rejected
    vi.clearAllTimers()
  })

  it('rejects a successful exit without a finish event', async () => {
    vi.useFakeTimers()
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('could not complete')
    writeEvents(child, { type: 'text', delta: 'Answer' })
    child.emit('close', 0)
    await rejected
    vi.clearAllTimers()
  })

  it.each([
    ['empty answer', '', 0],
    ['nonzero exit', 'Answer', 1],
  ])('rejects %s even when a finish event was received', async (_label, delta, exitCode) => {
    vi.useFakeTimers()
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('could not complete')
    writeEvents(child, { type: 'text', delta }, completion())
    child.emit('close', exitCode)
    await rejected
    vi.clearAllTimers()
  })

  it('sanitizes process and stdin errors', async () => {
    for (const event of ['process', 'stdin']) {
      const child = prepareChild()
      const pending = runLocalCodex('Question', options)
      const rejected = expect(pending).rejects.toThrow(event === 'process'
        ? 'Could not start the local Codex runtime.'
        : 'Could not send the local Codex request.')
      if (event === 'process') child.emit('error', new Error('PRIVATE_API_KEY=test-only-secret'))
      else child.stdin.emit('error', new Error('PRIVATE_API_KEY=test-only-secret'))
      child.emit('close', 1)
      await rejected
    }
  })

  it('kills the whole process group on abort and escalates if it does not exit', async () => {
    vi.useFakeTimers()
    const child = prepareChild()
    const controller = new AbortController()
    const pending = runLocalCodex('Question', options, controller.signal)
    const rejected = expect(pending).rejects.toThrow('cancelled')
    controller.abort()
    await rejected
    expect(process.kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(process.kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL')
    child.emit('close', 1)
  })

  it('kills the process group on timeout but cancels escalation after a confirmed exit', async () => {
    vi.useFakeTimers()
    mockEnv.CODEX_LOCAL_TIMEOUT_SECONDS = 1
    const child = prepareChild()
    const pending = runLocalCodex('Question', options)
    const rejected = expect(pending).rejects.toThrow('configured time limit')
    await vi.advanceTimersByTimeAsync(1_000)
    await rejected
    expect(process.kill).toHaveBeenCalledExactlyOnceWith(-child.pid, 'SIGTERM')
    child.emit('close', 1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(process.kill).not.toHaveBeenCalledWith(-child.pid, 'SIGKILL')
  })

  it('does not spawn for a pre-aborted signal, production or Railway', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runLocalCodex('Question', options, controller.signal)).rejects.toThrow()
    mockEnv.NODE_ENV = 'production'
    await expect(runLocalCodex('Question', options)).rejects.toThrow('trusted development machines')
    mockEnv.NODE_ENV = 'development'
    vi.stubEnv('RAILWAY_PROJECT_ID', 'test-project')
    await expect(runLocalCodex('Question', options)).rejects.toThrow('trusted development machines')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('does not silently replace a selected API runtime with local Codex', async () => {
    mockEnv.LLM_RUNTIME = 'api'
    await expect(runLocalCodex('Question', options)).rejects.toThrow('trusted development machines')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('passes an allowlisted environment without app, database or paid-provider credentials', async () => {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_SECRET_ACCESS_KEY']) {
      vi.stubEnv(name, 'test-only-do-not-forward')
    }
    vi.stubEnv('LANG', 'en_US.UTF-8')
    const child = prepareChild()
    const pending = runLocalCodex('Question', { ...options, instructions: 'Use source evidence.' })
    const [command, args, spawnOptions] = spawnMock.mock.calls[0]
    expect(command).toBe('uv')
    expect(args).toEqual(['run', '--locked', '--no-sync', 'python', expect.stringMatching(/backend\/scripts\/run_local_codex_chat\.py$/)])
    expect(spawnOptions).toMatchObject({ detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    expect(Object.keys(spawnOptions.env).every(name => ['CODEX_HOME', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR'].includes(name)))
      .toBe(true)
    expect(spawnOptions.env.LANG).toBe('en_US.UTF-8')
    expect(JSON.stringify(spawnOptions.env)).not.toContain('test-only-do-not-forward')
    expect(JSON.parse(child.stdin.read().toString())).toEqual({
      prompt: 'Question', model: options.model, reasoning_effort: 'high', instructions: 'Use source evidence.',
    })
    writeEvents(child, { type: 'text', delta: 'Answer.' }, completion())
    child.emit('close', 0)
    await pending
  })

  it('provides the scoped callback only through stdin and closes it after completion', async () => {
    const child = prepareChild()
    const pending = runLocalCodex('Question', { ...options, tools: [fixtureTool()] })
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
    const input = JSON.parse(child.stdin.read().toString())
    const callback = { url: input.callback_url, token: input.callback_token }
    expect((await sendRequest(callback, '/tools')).status).toBe(200)
    expect(JSON.stringify(spawnMock.mock.calls[0])).not.toContain(input.callback_token)
    writeEvents(child, { type: 'text', delta: 'Answer.' }, completion())
    child.emit('close', 0)
    await pending
    await expect(sendRequest(callback, '/tools')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('also closes the scoped tool listener after a cancelled model run', async () => {
    const child = prepareChild()
    const controller = new AbortController()
    const pending = runLocalCodex('Question', { ...options, tools: [fixtureTool()] }, controller.signal)
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
    const input = JSON.parse(child.stdin.read().toString())
    const callback = { url: input.callback_url, token: input.callback_token }
    controller.abort()
    child.emit('close', 1)
    await rejected
    await expect(sendRequest(callback, '/tools')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })
})
