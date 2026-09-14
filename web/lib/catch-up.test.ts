import type { CatchUpSummary, OpenLoop } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { groupCatchUp, urgencyOf } from './catch-up'

const now = new Date('2026-09-14T16:00:00.000Z')

function loop(id: string, over: Partial<OpenLoop>): OpenLoop {
  return {
    id,
    userId: 'u',
    title: id,
    category: 'other',
    area: 'other',
    status: 'NEEDS_YOU',
    owner: 'user',
    actionType: 'none',
    riskLevel: 'low',
    priority: 'medium',
    interruptUser: false,
    confidence: 0.8,
    sourceRefs: [{ sourceType: 'email', sourceId: 's' }],
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...over,
  }
}

type Item = CatchUpSummary['items'][number]
const item = (loopId: string, kind: Item['kind'] = 'fyi'): Item => ({
  loopId,
  title: loopId,
  kind,
  text: `about ${loopId}`,
})

describe('urgencyOf', () => {
  it('calls the person’s own overdue, due-by-tomorrow or critical move urgent', () => {
    expect(urgencyOf(item('a'), loop('a', { dueAt: '2026-09-12T23:59:00.000Z' }), now)).toBe('now')
    expect(urgencyOf(item('b'), loop('b', { dueAt: '2026-09-15T23:59:00.000Z' }), now)).toBe('now')
    expect(urgencyOf(item('c'), loop('c', { priority: 'critical' }), now)).toBe('now')
    expect(
      urgencyOf(item('d'), loop('d', { status: 'UNCERTAIN', dueAt: now.toISOString() }), now),
    ).toBe('now')
  })

  it('puts a later move of theirs, or anything due this week, in soon', () => {
    expect(urgencyOf(item('a'), loop('a', { dueAt: '2026-09-19T23:59:00.000Z' }), now)).toBe('soon')
    expect(urgencyOf(item('b'), loop('b', {}), now)).toBe('soon')
    const waitingSoon = loop('c', { status: 'WAITING', dueAt: '2026-09-15T23:59:00.000Z' })
    expect(urgencyOf(item('c'), waitingSoon, now)).toBe('soon')
  })

  it('lets what others owe or what is only watched wait, and closes what is resolved', () => {
    expect(urgencyOf(item('a'), loop('a', { status: 'WAITING' }), now)).toBe('later')
    const farOff = loop('b', { status: 'WATCHING', dueAt: '2027-06-12T23:59:00.000Z' })
    expect(urgencyOf(item('b'), farOff, now)).toBe('later')
    const alreadyHappened = loop('d', { status: 'WATCHING', dueAt: '2026-09-10T22:00:00.000Z' })
    expect(urgencyOf(item('d'), alreadyHappened, now)).toBe('later')
    // The ledger wins over the model's label: an item called "needs you" on a closed loop is closed.
    const closed = loop('c', { status: 'RESOLVED', resolvedAt: now.toISOString() })
    expect(urgencyOf(item('c', 'needs_you'), closed, now)).toBe('closed')
  })

  it('falls back on the kind when the loop is no longer in the ledger', () => {
    expect(urgencyOf(item('x', 'resolved'), undefined, now)).toBe('closed')
    expect(urgencyOf(item('x', 'deadline'), undefined, now)).toBe('soon')
    expect(urgencyOf(item('x', 'waiting'), undefined, now)).toBe('later')
  })
})

describe('groupCatchUp', () => {
  it('orders the groups by urgency, soonest due first inside each, and drops empty groups', () => {
    const loops = [
      loop('deposit', { dueAt: '2026-09-15T23:59:00.000Z', priority: 'critical' }),
      loop('insurance', { dueAt: '2026-09-12T23:59:00.000Z' }),
      loop('form', { status: 'RESOLVED', resolvedAt: now.toISOString() }),
      loop('advisor', { status: 'WAITING' }),
    ]
    const summary: CatchUpSummary = {
      headline: 'Two things are urgent.',
      items: [
        item('form', 'resolved'),
        item('advisor', 'waiting'),
        item('deposit', 'deadline'),
        item('insurance', 'needs_you'),
      ],
      nothingElse: false,
    }
    const grouped = groupCatchUp(summary, loops, now)
    expect(grouped.headline).toBe('Two things are urgent.')
    expect(grouped.groups.map((g) => [g.urgency, g.items.map((i) => i.loopId)])).toEqual([
      ['now', ['insurance', 'deposit']],
      ['later', ['advisor']],
      ['closed', ['form']],
    ])
    expect(grouped.groups[0]?.items.map((i) => i.due)).toEqual([
      'Overdue by 2 days',
      'Due tomorrow',
    ])
    expect(grouped.groups[2]?.items[0]?.due).toBeUndefined()
    // Someone else's date is a date, not an overdue warning.
    const late = groupCatchUp(
      { headline: '', items: [item('club')], nothingElse: true },
      [loop('club', { status: 'WATCHING', dueAt: '2026-09-10T22:00:00.000Z' })],
      now,
    )
    expect(late.groups[0]?.items[0]?.due).toBe('Sep 10')
  })
})
