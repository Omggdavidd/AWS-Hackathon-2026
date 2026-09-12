import { LocalLedgerStore, type ProposedAction } from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { resolveLoopByUser } from './resolve'

const now = '2026-09-10T13:00:00.000Z'

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
    createdAt: now,
    ...over,
  }
}

async function setup() {
  const store = new LocalLedgerStore()
  await store.putLoop(loop({ id: 'loop-1', userId: 'user-1', status: 'NEEDS_YOU' }))
  return store
}

describe('resolveLoopByUser', () => {
  it('resolves the loop and cancels every proposed action it leaves behind', async () => {
    const store = await setup()
    await store.putAction(action({ id: 'a1' }))
    await store.putAction(action({ id: 'a2', type: 'remind', summary: 'Remind you' }))

    expect(await resolveLoopByUser(store, 'user-1', 'loop-1', now)).toBe(true)

    expect((await store.getLoop('user-1', 'loop-1'))?.status).toBe('RESOLVED')
    const actions = await store.listActions('user-1', { loopId: 'loop-1' })
    expect(actions.map((a) => a.status)).toEqual(['CANCELLED', 'CANCELLED'])

    // Each cancellation is attributed to its action, so the loop page can say why.
    const audit = await store.listAudit('user-1', { loopId: 'loop-1' })
    const cancelled = audit.filter((e) => e.kind === 'action_cancelled')
    expect(cancelled.map((e) => e.actionId).sort()).toEqual(['a1', 'a2'])
    expect(cancelled.every((e) => e.actor === 'user')).toBe(true)
    expect(audit.some((e) => e.kind === 'state_changed')).toBe(true)
  })

  it('leaves approved actions alone: the user asked for those and one may be running', async () => {
    const store = await setup()
    await store.putAction(action({ id: 'approved', status: 'APPROVED' }))
    await store.putAction(action({ id: 'executed', status: 'EXECUTED' }))

    await resolveLoopByUser(store, 'user-1', 'loop-1', now)

    const byId = Object.fromEntries(
      (await store.listActions('user-1', { loopId: 'loop-1' })).map((a) => [a.id, a.status]),
    )
    expect(byId).toEqual({ approved: 'APPROVED', executed: 'EXECUTED' })
  })

  it('does nothing to an already resolved loop, so a double click writes no second audit', async () => {
    const store = await setup()
    await resolveLoopByUser(store, 'user-1', 'loop-1', now)
    const before = (await store.listAudit('user-1', { loopId: 'loop-1' })).length

    expect(await resolveLoopByUser(store, 'user-1', 'loop-1', now)).toBe(false)
    expect(await store.listAudit('user-1', { loopId: 'loop-1' })).toHaveLength(before)
  })

  it('returns false for an unknown loop', async () => {
    const store = await setup()
    expect(await resolveLoopByUser(store, 'user-1', 'nope', now)).toBe(false)
  })
})
