import { LocalLedgerStore, type OpenLoop, type ProposedAction } from '@openloop/shared'
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

describe('parkLoopByUser racing the agent', () => {
  it('keeps what a scan wrote mid-click and still parks, in one retry', async () => {
    const store = await setup()
    const attempts = raceWrites(store, 1)

    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(true)

    const parked = await store.getLoop('user-1', 'loop-1')
    expect(parked?.status).toBe('WATCHING')
    expect(parked?.remindAt).toBe(tomorrow)
    expect(parked?.nextAction).toBe(SCAN_NEXT_ACTION)
    expect(attempts).toHaveLength(2)
  })

  it('audits the retried park once, not once per attempt', async () => {
    const store = await setup()
    raceWrites(store, 1)

    await parkLoopByUser(store, 'user-1', 'loop-1', 'ignore', now)

    expect(await reasons(store)).toEqual(['You ignored this; NEEDS_YOU -> WATCHING'])
  })

  it('gives up after three attempts and reports it did nothing, rather than throwing', async () => {
    const store = await setup()
    const attempts = raceWrites(store, Number.POSITIVE_INFINITY)

    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(false)

    expect(attempts).toHaveLength(3)
    expect((await store.getLoop('user-1', 'loop-1'))?.status).toBe('NEEDS_YOU')
    expect(await reasons(store)).toEqual([])
  })

  it('re-reads before parking again, so a loop resolved by the winner stays resolved', async () => {
    const store = await setup()
    raceWrites(store, 1, (l) => ({ ...l, status: 'RESOLVED', resolvedAt: now }))

    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(false)
    expect((await store.getLoop('user-1', 'loop-1'))?.status).toBe('RESOLVED')
    expect(await reasons(store)).toEqual([])
  })

  // The reason has to come from the fresh record: the scan moved the loop to Watching, so the
  // retry re-parks rather than transitioning, and must not still claim NEEDS_YOU -> WATCHING.
  it('reports the move the retry actually made, not the one the stale read implied', async () => {
    const store = await setup()
    raceWrites(store, 1, (l) => ({ ...l, status: 'WATCHING' }))

    expect(await parkLoopByUser(store, 'user-1', 'loop-1', 'remind', now)).toBe(true)
    expect(await reasons(store)).toEqual(['You asked to be reminded tomorrow'])
  })
})
