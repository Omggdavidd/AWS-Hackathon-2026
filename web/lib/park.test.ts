import { LocalLedgerStore, type ProposedAction } from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { parkLoopByUser } from './park'

const now = '2026-09-12T13:00:00.000Z'
const tomorrow = '2026-09-13T13:00:00.000Z'

async function setup(over: Parameters<typeof loop>[0] = {}) {
  const store = new LocalLedgerStore()
  await store.putLoop(loop({ id: 'loop-1', userId: 'user-1', status: 'NEEDS_YOU', ...over }))
  return store
}

async function reasons(store: LocalLedgerStore) {
  return (await store.listAudit('user-1', { loopId: 'loop-1' })).map((e) => e.reason)
}

describe('parkLoopByUser', () => {
  it('moves a loop that needs you into Watching and sets the reminder', async () => {
    const store = await setup()
    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(true)

    const parked = await store.getLoop('user-1', 'loop-1')
    expect(parked?.status).toBe('WATCHING')
    expect(parked?.remindAt).toBe(tomorrow)
    expect(await reasons(store)).toEqual([
      'You asked to be reminded tomorrow; NEEDS_YOU -> WATCHING',
    ])
  })

  it('ignoring moves it to Watching without a reminder, so it leaves the needs-you count', async () => {
    const store = await setup()
    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'ignore', now)).toBe(true)

    const parked = await store.getLoop('user-1', 'loop-1')
    expect(parked?.status).toBe('WATCHING')
    expect(parked?.remindAt).toBeUndefined()
    expect(await store.listLoops('user-1', { status: 'NEEDS_YOU' })).toEqual([])
    expect(await reasons(store)).toEqual(['You ignored this; NEEDS_YOU -> WATCHING'])
  })

  it('re-parks a loop that is already Watching instead of throwing on a no-op transition', async () => {
    const store = await setup({ status: 'WATCHING' })
    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(true)

    const parked = await store.getLoop('user-1', 'loop-1')
    expect(parked?.status).toBe('WATCHING')
    expect(parked?.remindAt).toBe(tomorrow)
    expect(parked?.updatedAt).toBe(now)
    // No arrow, because nothing moved.
    expect(await reasons(store)).toEqual(['You asked to be reminded tomorrow'])
  })

  it('drops a reminder that is already set when the loop is ignored', async () => {
    const store = await setup({ status: 'WATCHING', remindAt: tomorrow })
    await parkLoopByUser(store, 'user-1', 'loop-1', 'ignore', now)
    expect((await store.getLoop('user-1', 'loop-1'))?.remindAt).toBeUndefined()
  })

  it('does nothing for a resolved or unknown loop', async () => {
    const store = await setup({ status: 'RESOLVED', resolvedAt: now })
    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(false)
    expect(await parkLoopByUser(store, 'user-1', 'nope', 'remind', now)).toBe(false)
    expect(await reasons(store)).toEqual([])
  })

  it('leaves proposed actions alone: parking is not resolving', async () => {
    const store = await setup()
    const action: ProposedAction = {
      id: 'a1',
      loopId: 'loop-1',
      userId: 'user-1',
      type: 'draft_email',
      riskTier: 'medium',
      requiresApproval: false,
      summary: 'Draft a reply',
      payload: {},
      status: 'PROPOSED',
      createdAt: now,
    }
    await store.putAction(action)

    await parkLoopByUser(store, 'user-1', 'loop-1', 'ignore', now)

    const actions = await store.listActions('user-1', { loopId: 'loop-1' })
    expect(actions.map((a) => a.status)).toEqual(['PROPOSED'])
  })
})
