#!/usr/bin/env node
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = process.env.NEXT_DIST_DIR || '.next'
const routes = [
  { route: 'api/chat', status: 400 },
  { route: 'api/internal/agent/continue', status: 401 },
]
const isolated = await mkdtemp(path.join(tmpdir(), 'vibedigest-agent-artifact-'))

try {
  // Copy only files declared by Next's deployment traces, never the checkout
  // or a symlink to its node_modules. Preserve relative deployment paths.
  const files = new Set()
  for (const { route } of routes) {
    const entry = path.join(root, 'frontend', dist, 'server/app', route, 'route.js')
    const trace = JSON.parse(await readFile(entry + '.nft.json', 'utf8'))
    files.add(entry)
    for (const file of trace.files) files.add(path.resolve(path.dirname(entry), file))
  }
  for (const file of files) {
    const relative = path.relative(root, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Traced file outside repository: ${relative}`)
    }
    const target = path.join(isolated, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(file, target)
  }

  const probe = path.join(isolated, 'probe.cjs')
  await writeFile(probe, `
const assert = require('node:assert/strict')
const path = require('node:path')
// These invalid requests must exit before auth, backend or model traffic.
// Fail closed even if a future refactor accidentally introduces network I/O.
const denyNetwork = () => { throw new Error('Artifact check attempted network I/O') }
globalThis.fetch = denyNetwork
require('node:http').request = denyNetwork
require('node:https').request = denyNetwork
require('node:net').Socket.prototype.connect = denyNetwork
;(async () => {
  for (const { route, status } of ${JSON.stringify(routes)}) {
    const entry = path.join(process.cwd(), ${JSON.stringify(dist)}, 'server/app', route, 'route.js')
    const { routeModule } = require(entry)
    const response = await routeModule.userland.POST(new Request('http://localhost/' + route, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))
    assert.equal(response.status, status, route + ' failed its packaged route contract')
    console.log('PASS POST /' + route + ' -> ' + response.status)
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
`)
  const result = spawnSync(process.execPath, [probe], {
    cwd: path.join(isolated, 'frontend'),
    // Do not inherit credentials, NODE_PATH, NODE_OPTIONS or local dotenv files.
    env: {
      NODE_ENV: 'production',
      BACKEND_API_URL: 'http://127.0.0.1:1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'artifact-check',
      LLM_RUNTIME: 'api',
      AGENT_INTERNAL_SECRET: 'artifact-check-secret-at-least-32-characters',
    },
    encoding: 'utf8',
    timeout: 15_000,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Packaged Agent routes failed (exit ${result.status})`)
} finally {
  await rm(isolated, { recursive: true, force: true })
}
