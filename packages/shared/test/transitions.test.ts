import { describe, expect, it } from 'vitest'
import {
  applyTransition,
  canTransition,
  InvalidTransitionError,
  type LoopStatus,
} from '../src/index'
import { loop } from './store-contract'

const STATES: LoopStatus[] = ['NEEDS_YOU', 'WAITING', 'WATCHING', 'RESOLVED', 'UNCERTAIN']

/**
 * Every (from, to) pair written out, so a wrong row in the lifecycle table fails here instead of
 * shipping (SPEC §7). New evidence can move any state and resolution can close any state; the only
 * move the graph refuses is a closed loop falling back into UNCERTAIN.
 */
const EXPECTED: Record<LoopStatus, Record<LoopStatus, boolean>> = {
  NEEDS_YOU: { NEEDS_YOU: false, WAITING: true, WATCHING: true, RESOLVED: true, UNCERTAIN: true },
  WAITING: { NEEDS_YOU: true, WAITING: false, WATCHING: true, RESOLVED: true, UNCERTAIN: true },
  WATCHING: { NEEDS_YOU: true, WAITING: true, WATCHING: false, RESOLVED: true, UNCERTAIN: true },
  RESOLVED: { NEEDS_YOU: true, WAITING: true, WATCHING: true, RESOLVED: false, UNCERTAIN: false },
  UNCERTAIN: { NEEDS_YOU: true, WAITING: true, WATCHING: true, RESOLVED: true, UNCERTAIN: false },
}

const pairs = STATES.flatMap((from) => STATES.map((to) => [from, to] as const))
const now = '2026-09-10T00:00:00.000Z'

describe('the lifecycle table', () => {
  it.each(pairs)('says whether %s can become %s', (from, to) => {
    expect(canTransition(from, to)).toBe(EXPECTED[from][to])
  })

  it.each(pairs)('applies %s to %s only when the table allows it', (from, to) => {
    const before = loop({ status: from, ...(from === 'RESOLVED' ? { resolvedAt: now } : {}) })
    if (!EXPECTED[from][to]) {
      expect(() => applyTransition(before, to, now)).toThrow(InvalidTransitionError)
      return
    }
    expect(applyTransition(before, to, now).status).toBe(to)
  })
})

describe('transitions', () => {
  it('stamps resolvedAt on RESOLVED and clears it on reopen', () => {
    const resolved = applyTransition(loop(), 'RESOLVED', now)
    expect(resolved.resolvedAt).toBe(now)
    const reopened = applyTransition(resolved, 'NEEDS_YOU', '2026-09-11T00:00:00.000Z')
    expect(reopened.resolvedAt).toBeUndefined()
    expect(reopened.updatedAt).toBe('2026-09-11T00:00:00.000Z')
  })

  it('clears a pending reminder when the loop closes, and only then', () => {
    const parked = loop({ status: 'WATCHING', remindAt: '2026-09-11T13:00:00.000Z' })
    expect(applyTransition(parked, 'RESOLVED', now).remindAt).toBeUndefined()
    expect(applyTransition(parked, 'NEEDS_YOU', now).remindAt).toBe('2026-09-11T13:00:00.000Z')
  })

  it('leaves every other field alone', () => {
    const before = loop({ title: 'Pay the deposit', priority: 'critical' })
    const after = applyTransition(before, 'WAITING', now)
    expect(after).toEqual({ ...before, status: 'WAITING', updatedAt: now })
  })

  it('returns a new loop instead of editing the one it was given', () => {
    const before = loop({
      status: 'WATCHING',
      remindAt: '2026-09-11T13:00:00.000Z',
      resolvedAt: undefined,
    })
    const snapshot = structuredClone(before)
    const after = applyTransition(before, 'RESOLVED', now)
    expect(before).toEqual(snapshot)
    expect(after).not.toBe(before)
  })

  it('throws on an invalid transition', () => {
    expect(() =>
      applyTransition(loop({ status: 'RESOLVED', resolvedAt: now }), 'UNCERTAIN', now),
    ).toThrow(InvalidTransitionError)
  })
})
