import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two ways the lock can hurt the person using it rather than bound the agent: a deployment with
 * no unlock key that anyone can pause and nobody can resume, and an approval that moves the record
 * to APPROVED while the paused runtime refuses to execute it. Nothing here reaches AWS.
 */
const lock = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
const store = vi.hoisted(() => ({
  getAction: vi.fn(),
  putAction: vi.fn(),
  appendAudit: vi.fn(),
}))

vi.mock('@openloop/ledger-dynamo', () => ({
  getRuntimeMode: lock.read,
  putRuntimeMode: lock.write,
  parseRuntimeMode: (value?: string) => (value === 'demo' || value === 'locked' ? value : 'open'),
}))

vi.mock('@/lib/ledger', () => ({
  USER_ID: 'user-alex',
  LEDGER_TABLE: 'openloop-ledger-test',
  getStore: async () => store,
  resetLedger: async () => 'reset',
}))

vi.mock('@/lib/agent', () => ({ scanConfigured: false, invokeCommand: vi.fn() }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))

const KEY = 'test-unlock-key'
const env = { ...process.env }

const PROPOSED = {
  id: 'action-1',
  loopId: 'loop-1',
  userId: 'user-alex',
  status: 'PROPOSED',
  summary: 'Reply to the landlord',
}

async function load(unlockKey?: string) {
  if (unlockKey) process.env.OPENLOOP_UNLOCK_KEY = unlockKey
  else delete process.env.OPENLOOP_UNLOCK_KEY
  vi.resetModules()
  return {
    actions: await import('../app/actions'),
    PAUSED_MESSAGE: (await import('./runtime-lock')).PAUSED_MESSAGE,
  }
}

function form(mode: string, key?: string): FormData {
  const data = new FormData()
  data.set('mode', mode)
  if (key !== undefined) data.set('key', key)
  return data
}

beforeEach(() => {
  lock.read.mockReset().mockResolvedValue('open')
  lock.write.mockReset().mockResolvedValue(undefined)
  store.getAction.mockReset().mockResolvedValue(PROPOSED)
  store.putAction.mockReset().mockResolvedValue(undefined)
  store.appendAudit.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  process.env = { ...env }
})

describe('a deployment with no unlock key', () => {
  it('cannot be paused from Settings, because it could not be resumed there', async () => {
    const { actions } = await load()
    await expect(actions.setRuntimeMode(form('demo'))).resolves.toBeUndefined()
    await expect(actions.setRuntimeMode(form('locked'))).resolves.toBeUndefined()
    expect(lock.write).not.toHaveBeenCalled()
  })

  it('refuses to resume too, so the control as a whole does nothing', async () => {
    const { actions } = await load()
    await expect(actions.setRuntimeMode(form('open', KEY))).resolves.toBeUndefined()
    expect(lock.write).not.toHaveBeenCalled()
  })
})

describe('a deployment with an unlock key', () => {
  it('pauses on a click', async () => {
    const { actions } = await load(KEY)
    await actions.setRuntimeMode(form('locked'))
    expect(lock.write).toHaveBeenCalledWith('openloop-ledger-test', 'locked')
  })

  it('resumes with the key and refuses without it', async () => {
    const { actions } = await load(KEY)
    lock.read.mockResolvedValue('locked')
    await expect(actions.setRuntimeMode(form('open', 'wrong'))).rejects.toThrow('unlock key')
    expect(lock.write).not.toHaveBeenCalled()
    await actions.setRuntimeMode(form('open', KEY))
    expect(lock.write).toHaveBeenCalledWith('openloop-ledger-test', 'open')
  })
})

describe('approve while the runtime is paused', () => {
  it('refuses before the record moves, rather than approving what cannot run', async () => {
    const { actions, PAUSED_MESSAGE } = await load(KEY)
    lock.read.mockResolvedValue('locked')
    await expect(actions.approveAction('action-1')).rejects.toThrow(PAUSED_MESSAGE)
    expect(store.putAction).not.toHaveBeenCalled()
    expect(store.appendAudit).not.toHaveBeenCalled()
  })

  it('approves as usual once it is open', async () => {
    const { actions } = await load(KEY)
    await actions.approveAction('action-1')
    expect(store.putAction).toHaveBeenCalledWith({ ...PROPOSED, status: 'APPROVED' })
  })
})
