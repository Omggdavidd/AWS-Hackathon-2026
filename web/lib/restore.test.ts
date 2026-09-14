import { LocalLedgerStore, type OpenLoop, type ProposedAction } from '@openloop/shared'
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

describe('restoreLoopByUser racing the agent', () => {
  it('keeps what a scan wrote mid-undo and still restores, in one retry', async () => {
    const store = await setup()
    await resolveLoopByUser(store, 'user-1', 'loop-1', t0)
    const attempts = raceWrites(store, 1)

    expect(await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)).toBe(true)

    const after = await store.getLoop('user-1', 'loop-1')
    expect(after?.status).toBe('NEEDS_YOU')
    expect(after?.nextAction).toBe(SCAN_NEXT_ACTION)
    expect(attempts).toHaveLength(2)
  })

  it('restores each cancelled proposal once despite the retry', async () => {
    const store = await setup()
    await store.putAction(action({ id: 'kept' }))
    await resolveLoopByUser(store, 'user-1', 'loop-1', t0)
    raceWrites(store, 1)

    await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)

    const audit = await store.listAudit('user-1', { loopId: 'loop-1' })
    const undone = 'You undid that; RESOLVED -> NEEDS_YOU'
    expect(audit.filter((e) => e.reason === undone)).toHaveLength(1)
    expect(audit.filter((e) => e.kind === 'action_proposed')).toHaveLength(1)
  })

  it('gives up after three attempts and reports it did nothing, rather than throwing', async () => {
    const store = await setup()
    await resolveLoopByUser(store, 'user-1', 'loop-1', t0)
    const attempts = raceWrites(store, Number.POSITIVE_INFINITY)

    expect(await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)).toBe(false)

    expect(attempts).toHaveLength(3)
    expect((await store.getLoop('user-1', 'loop-1'))?.status).toBe('RESOLVED')
  })

  it('stops when the re-read shows the winner already put the loop back', async () => {
    const store = await setup()
    await resolveLoopByUser(store, 'user-1', 'loop-1', t0)
    raceWrites(store, 1, (l) => {
      const back = { ...l, status: 'NEEDS_YOU' as const }
      delete back.resolvedAt
      return back
    })

    expect(await restoreLoopByUser(store, 'user-1', 'loop-1', 'NEEDS_YOU', t0, t1)).toBe(false)
    const audit = await store.listAudit('user-1', { loopId: 'loop-1' })
    expect(audit.filter((e) => e.reason.startsWith('You undid that'))).toEqual([])
  })
})
