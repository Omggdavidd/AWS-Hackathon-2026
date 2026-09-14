import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * `pnpm reset-demo` deletes the demo user's rows and then rescans through the runtime. A paused
 * runtime runs no scan, so the delete has to be refused before it happens; the alternative is an
 * empty table and an exit code of 0. The DynamoDB calls go to a local server that answers like the
 * table and records what was asked of it, so this reaches no AWS service.
 */
const TABLE = 'openloop-ledger-test'
const script = fileURLToPath(new URL('../scripts/reset-demo.ts', import.meta.url))
const tsx = createRequire(import.meta.url).resolve('tsx/cli')

const target = (req: { headers: Record<string, string | string[] | undefined> }) =>
  String(req.headers['x-amz-target'] ?? '').split('.')[1] ?? ''

/** One loop row to delete, so a reset that is not refused issues a real BatchWriteItem. */
const ONE_LOOP = { Items: [{ PK: { S: 'USER#user-alex' }, SK: { S: 'LOOP#loop-1' } }], Count: 1 }
const NONE = { Items: [], Count: 0 }

let server: Server
let endpoint: string
let asked: string[] = []
let mode = 'locked'

beforeEach(async () => {
  asked = []
  mode = 'locked'
  server = createServer((req, res) => {
    const op = target(req)
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      asked.push(op)
      const reply =
        op === 'GetItem'
          ? mode === 'open'
            ? {}
            : { Item: { mode: { S: mode } } }
          : op === 'Query'
            ? body.includes('LOOP#') && !body.includes('EVIDENCE#')
              ? ONE_LOOP
              : NONE
            : { UnprocessedItems: {} }
      res.writeHead(200, { 'content-type': 'application/x-amz-json-1.0' })
      res.end(JSON.stringify(reply))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  endpoint = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function reset(...args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsx, script, '--table', TABLE, '--yes', ...args], {
      env: {
        PATH: process.env.PATH ?? '',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_EC2_METADATA_DISABLED: 'true',
        DYNAMODB_ENDPOINT: endpoint,
        OPENLOOP_LEDGER_TABLE: TABLE,
        OPENLOOP_RUNTIME_ARN: 'arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/none',
      },
    })
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      out += chunk
    })
    child.on('close', (code) => resolve({ code, out }))
  })
}

describe('reset-demo against a paused runtime', () => {
  it('refuses before deleting anything', async () => {
    const { code, out } = await reset()
    expect(out).toContain('refusing to delete anything')
    expect(out).toContain('paused (locked)')
    expect(code).toBe(1)
    expect(asked).toEqual(['GetItem'])
  }, 30_000)

  it('still clears the table with --no-scan, which asks for no rescan', async () => {
    const { code, out } = await reset('--no-scan')
    expect(out).toContain('✓ deleted 1 loops')
    expect(code).toBe(0)
    expect(asked).toContain('BatchWriteItem')
  }, 30_000)
})
