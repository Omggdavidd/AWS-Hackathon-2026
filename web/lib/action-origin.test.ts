import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// `lib/ledger` reads all three of these when it is first imported, so they have to be set before the
// dynamic imports below: a throwaway copy of the demo ledger, and never the real DynamoDB table.
// The repo root is pinned because it otherwise depends on whether vitest was started in `web/`.
process.env.OPENLOOP_REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
process.env.OPENLOOP_LEDGER_FILE = join(
  mkdtempSync(join(tmpdir(), 'openloop-actions-')),
  'ledger.json',
)
delete process.env.OPENLOOP_LEDGER_TABLE

const { request } = vi.hoisted(() => ({ request: { headers: new Headers() } }))

// `headers`, `cookies` and `revalidatePath` only work inside a request. These stubs stand in for it.
vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => ({ set: () => {} }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const actions = await import('../app/actions')
const { getStore, USER_ID } = await import('./ledger')

const HOST = 'localhost:3000'
const REFUSED = 'Refused: request did not come from this app'

function requestFrom(origin?: string): void {
  request.headers = new Headers(origin ? { host: HOST, origin } : { host: HOST })
}

function named(name: string): FormData {
  const form = new FormData()
  form.set('name', name)
  return form
}

/** Every exported server action, called with arguments that change nothing once it is let through. */
const calls: Record<string, () => Promise<unknown>> = {
  markDone: () => actions.markDone('no-such-loop'),
  undoMove: () => actions.undoMove('no-such-loop', 'NEEDS_YOU', '2026-09-13T00:00:00.000Z'),
  remindTomorrow: () => actions.remindTomorrow('no-such-loop'),
  ignoreLoop: () => actions.ignoreLoop('no-such-loop'),
  approveAction: () => actions.approveAction('no-such-action'),
  cancelAction: () => actions.cancelAction('no-such-action'),
  nameAgent: () => actions.nameAgent(named('Loop')),
  updateProfile: () => actions.updateProfile(named('Loop')),
  renameAgent: () => actions.renameAgent(named('Nova')),
  resetDemo: () => actions.resetDemo(),
}

describe('server actions and the Origin header', () => {
  for (const [name, run] of Object.entries(calls)) {
    it(`${name} refuses a request with no Origin, which Next lets through`, async () => {
      requestFrom()
      await expect(run()).rejects.toThrow(REFUSED)
    })
  }

  for (const [name, run] of Object.entries(calls)) {
    it(`${name} runs when Origin matches the host`, async () => {
      requestFrom(`http://${HOST}`)
      const outcome = await run().then(
        () => 'ran',
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      )
      // nameAgent ends in redirect(), which throws a control-flow signal rather than returning.
      expect(['ran', 'NEXT_REDIRECT']).toContain(outcome)
    })
  }

  it('a refused call leaves the ledger untouched', async () => {
    requestFrom()
    await expect(actions.markDone('loop-deposit')).rejects.toThrow(REFUSED)
    const store = await getStore()
    expect((await store.getLoop(USER_ID, 'loop-deposit'))?.status).toBe('NEEDS_YOU')
  })

  it('the same call from the app resolves the loop', async () => {
    requestFrom(`http://${HOST}`)
    await actions.markDone('loop-deposit')
    const store = await getStore()
    expect((await store.getLoop(USER_ID, 'loop-deposit'))?.status).toBe('RESOLVED')
  })
})
