import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const saved = { ...process.env }

/**
 * `lib/ledger` reads the environment once, at import, and caches the store it opened, so every case
 * has to set the environment and then load a fresh copy of the module.
 */
async function loadLedger(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.resetModules()
  return import('./ledger')
}

beforeEach(() => {
  // Pinned because `lib/ledger` otherwise infers the root from the directory vitest was started in.
  process.env.OPENLOOP_REPO_ROOT = repoRoot
  process.env.OPENLOOP_LEDGER_FILE = join(
    mkdtempSync(join(tmpdir(), 'openloop-ledger-')),
    'ledger.json',
  )
  delete process.env.OPENLOOP_LEDGER_TABLE
  delete process.env.VERCEL_ENV
})

afterEach(() => {
  process.env = { ...saved }
})

describe('the ledger a deployment opens', () => {
  it('refuses to serve demo data in production with no table', async () => {
    const ledger = await loadLedger({ VERCEL_ENV: 'production' })
    await expect(ledger.getStore()).rejects.toThrow(/OPENLOOP_LEDGER_TABLE is not set/)
  })

  it('uses the shared table in production when it is set', async () => {
    const ledger = await loadLedger({
      VERCEL_ENV: 'production',
      OPENLOOP_LEDGER_TABLE: 'openloop-ledger-test',
    })
    expect(ledger.LEDGER_TABLE).toBe('openloop-ledger-test')
    // By name, not instanceof: resetModules gives this copy its own DynamoLedgerStore class.
    expect((await ledger.getStore()).constructor.name).toBe('DynamoLedgerStore')
  })

  it('still opens the seeded demo ledger with no VERCEL_ENV, as a developer has', async () => {
    const ledger = await loadLedger({})
    const store = await ledger.getStore()
    expect((await store.listLoops(ledger.USER_ID)).length).toBeGreaterThan(0)
  })

  it('still opens the seeded demo ledger on a preview deployment', async () => {
    const ledger = await loadLedger({ VERCEL_ENV: 'preview' })
    const store = await ledger.getStore()
    expect((await store.listLoops(ledger.USER_ID)).length).toBeGreaterThan(0)
  })
})
