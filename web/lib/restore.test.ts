import { LocalLedgerStore, type ProposedAction } from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { parkLoopByUser } from './park'
import { resolveLoopByUser } from './resolve'
import { restoreLoopByUser } from './restore'

const t0 = '2026-09-10T13:00:00.000Z'
const t1 = '2026-09-10T13:00:05.000Z'

function action(over: Partial<ProposedAction>): ProposedAction {
  return {
    id: 'a1',
    loopId: 'loop-1',
    userId: 'user-1',
    type: 'draft_email',
    riskTier: 'medium',
    requiresApproval: false,
    summary: 'Draft a reply',
    payload: {},
    status: 'PROPOSED',
    createdAt: t0,
    ...over,
  }
}

async function setup() {
  const store = new LocalLedgerStore()
  await store.putLoop(loop({ id: 'loop-1', userId: 'user-1', status: 'NEEDS_YOU' }))
  return store
}

describe('restoreLoopByUser', () => {
  it('undoes Done: the loop returns to its state and the proposals Done cancelled come back', async () => {
    const store = await setup()
    await store.putAction(action({ id: 'kept' }))
    await store.putAction(action({ id: 'declined', status: 'CANCELLED' }))
    await resolveLoopByUser(store, 'user-1', 'loop-1', t0)

    expect(await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)).toBe(true)

    expect((await store.getLoop('user-1', 'loop-1'))?.status).toBe('NEEDS_YOU')
    const byId = new Map(
      (await store.listActions('user-1', { loopId: 'loop-1' })).map((a) => [a.id, a.status]),
    )
    expect(byId.get('kept')).toBe('PROPOSED')
    expect(byId.get('declined')).toBe('CANCELLED')
  })

  it('undoes Snooze: back to the state before, with no reminder left behind', async () => {
    const store = await setup()
    await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', t0)
    expect((await store.getLoop('user-1', 'loop-1'))?.remindAt).toBeDefined()

    expect(await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)).toBe(true)
    const after = await store.getLoop('user-1', 'loop-1')
    expect(after?.status).toBe('NEEDS_YOU')
    expect(after?.remindAt).toBeUndefined()
  })

  it('does nothing when the loop is already where the undo would put it', async () => {
    const store = await setup()
    expect(await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)).toBe(false)
  })
})
