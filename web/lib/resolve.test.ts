import { LocalLedgerStore, type OpenLoop, type ProposedAction } from '@openloop/shared'
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

    // Strictly after the state change: equal timestamps sort by random uuid in DynamoDB.
    const resolved = audit.find((e) => e.kind === 'state_changed')
    expect(resolved).toBeDefined()
    expect(cancelled.every((e) => e.at > (resolved?.at ?? ''))).toBe(true)
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

const SCAN_NEXT_ACTION = 'Scan: pay the deposit by Friday'

/**
 * Let a competing writer land on the loop between the caller's read and its own write, for the
 * first `losses` attempts: the scan or the 07:00 catch-up against a user click. Returns the loops
 * the caller tried to write, so a test can count its attempts.
 */
function raceWrites(
  store: LocalLedgerStore,
  losses: number,
  change: (l: OpenLoop) => OpenLoop = (l) => ({ ...l, nextAction: SCAN_NEXT_ACTION }),
): OpenLoop[] {
  const write = store.putLoop.bind(store)
  const attempts: OpenLoop[] = []
  let left = losses
  store.putLoop = async (loop, opts) => {
    attempts.push(loop)
    if (left > 0) {
      left -= 1
      const current = await store.getLoop(loop.userId, loop.id)
      if (current) await write(change(current), { ifUnchanged: true })
    }
    return write(loop, opts)
  }
  return attempts
}

describe('resolveLoopByUser racing the agent', () => {
  it('keeps what a scan wrote mid-click and still resolves, in one retry', async () => {
    const store = await setup()
    const attempts = raceWrites(store, 1)

    expect(await resolveLoopByUser(store, 'user-1', 'loop-1', now)).toBe(true)

    const after = await store.getLoop('user-1', 'loop-1')
    expect(after?.status).toBe('RESOLVED')
    expect(after?.nextAction).toBe(SCAN_NEXT_ACTION)
    expect(attempts).toHaveLength(2)
  })

  it('audits the retried resolve once, not once per attempt', async () => {
    const store = await setup()
    await store.putAction(action({ id: 'a1' }))
    raceWrites(store, 1)

    await resolveLoopByUser(store, 'user-1', 'loop-1', now)

    const audit = await store.listAudit('user-1', { loopId: 'loop-1' })
    expect(audit.filter((e) => e.kind === 'state_changed')).toHaveLength(1)
    expect(audit.filter((e) => e.kind === 'action_cancelled')).toHaveLength(1)
  })

  it('gives up after three attempts and reports it did nothing, rather than throwing', async () => {
    const store = await setup()
    const attempts = raceWrites(store, Number.POSITIVE_INFINITY)

    expect(await resolveLoopByUser(store, 'user-1', 'loop-1', now)).toBe(false)

    expect(attempts).toHaveLength(3)
    expect((await store.getLoop('user-1', 'loop-1'))?.status).toBe('NEEDS_YOU')
    expect(await store.listAudit('user-1', { loopId: 'loop-1' })).toEqual([])
  })

  it('stops when the re-read shows the loop was resolved by whoever won', async () => {
    const store = await setup()
    raceWrites(store, 1, (l) => ({ ...l, status: 'RESOLVED', resolvedAt: now }))

    expect(await resolveLoopByUser(store, 'user-1', 'loop-1', now)).toBe(false)
    expect(await store.listAudit('user-1', { loopId: 'loop-1' })).toEqual([])
  })
})
