import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The headers the mocked `next/headers` hands to the action under test. */
let requestHeaders = new Headers()

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))

const env = { ...process.env }

/**
 * Fresh module state per test: `lib/ledger` reads OPENLOOP_LEDGER_TABLE at import and caches the
 * store it opened, so the environment has to be set before the action is loaded.
 */
async function load(over: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.resetModules()
  return { actions: await import('./actions'), ledger: await import('@/lib/ledger') }
}

beforeEach(async () => {
  requestHeaders = new Headers()
  const dir = await mkdtemp(path.join(tmpdir(), 'openloop-web-actions-'))
  // Explicit, because `lib/ledger` infers the repo root from cwd and the root `pnpm test` runs
  // these from the repo root rather than from web/.
  process.env.OPENLOOP_REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
  process.env.OPENLOOP_LEDGER_FILE = path.join(dir, 'ledger.json')
  delete process.env.OPENLOOP_LEDGER_TABLE
  delete process.env.VERCEL_ENV
})

afterEach(() => {
  process.env = { ...env }
})

describe('the origin guard on the actions that spend or reset', () => {
  it('refuses an approval with no Origin, which is what a scripted POST sends', async () => {
    const { actions } = await load()
    await expect(actions.approveAction('action-1')).rejects.toThrow(
      'Refused: request did not come from this app',
    )
  })

  it('refuses an approval from another site', async () => {
    requestHeaders = new Headers({
      origin: 'https://attacker.example.com',
      host: 'openloop-neon.vercel.app',
    })
    const { actions } = await load()
    await expect(actions.approveAction('action-1')).rejects.toThrow(
      'Refused: request did not come from this app',
    )
  })

  it('refuses a demo reset with no Origin', async () => {
    const { actions } = await load()
    await expect(actions.resetDemo()).rejects.toThrow('Refused: request did not come from this app')
  })

  it('lets the app itself through to the ledger, which has no such action', async () => {
    requestHeaders = new Headers({
      origin: 'https://openloop-neon.vercel.app',
      host: 'openloop-neon.vercel.app',
    })
    const { actions } = await load()
    await expect(actions.approveAction('no-such-action')).resolves.toBeUndefined()
  })
})

describe('the ledger a deployment gets', () => {
  // These are about which ledger a deployment opens, not the guard, so every call comes from the app.
  beforeEach(() => {
    requestHeaders = new Headers({
      origin: 'https://openloop-neon.vercel.app',
      host: 'openloop-neon.vercel.app',
    })
  })

  it('refuses to serve demo data in production with no table', async () => {
    const { actions } = await load({ VERCEL_ENV: 'production' })
    await expect(actions.markDone('loop-deposit')).rejects.toThrow(
      /OPENLOOP_LEDGER_TABLE is not set/,
    )
  })

  it('still opens the seeded demo ledger on a preview deployment', async () => {
    const { actions, ledger } = await load({ VERCEL_ENV: 'preview' })
    await expect(actions.markDone('loop-deposit')).resolves.toBeUndefined()
    const store = await ledger.getStore()
    expect((await store.listLoops(ledger.USER_ID)).length).toBeGreaterThan(0)
  })

  it('still opens the seeded demo ledger with no VERCEL_ENV, as a developer has', async () => {
    const { actions, ledger } = await load()
    await expect(actions.markDone('loop-deposit')).resolves.toBeUndefined()
    const store = await ledger.getStore()
    expect((await store.listLoops(ledger.USER_ID)).length).toBeGreaterThan(0)
  })
})
