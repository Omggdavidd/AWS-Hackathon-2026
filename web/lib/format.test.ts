import type { OpenLoop } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  formatDate,
  formatDue,
  groupByStatus,
  groupByTime,
  sortLoops,
  summarize,
  summaryParts,
} from './format'

const base: OpenLoop = {
  id: 'x',
  userId: 'u',
  title: 't',
  category: 'other',
  area: 'other',
  status: 'NEEDS_YOU',
  owner: 'user',
  actionType: 'none',
  riskLevel: 'low',
  priority: 'medium',
  interruptUser: false,
  confidence: 0.5,
  sourceRefs: [{ sourceType: 'email', sourceId: 's' }],
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}
const now = new Date('2026-09-10T12:00:00Z')

describe('formatDue', () => {
  it('describes relative due dates', () => {
    expect(formatDue(undefined, now)).toBeUndefined()
    expect(formatDue('2026-09-10T20:00:00Z', now)).toBe('Due today')
    expect(formatDue('2026-09-11T20:00:00Z', now)).toBe('Due tomorrow')
    expect(formatDue('2026-09-13T20:00:00Z', now)).toBe('Due in 3 days')
    expect(formatDue('2026-09-08T12:00:00Z', now)).toBe('Overdue by 2 days')
    expect(formatDue('2026-10-17T12:00:00Z', now)).toBe('Due Oct 17')
    expect(formatDue('2027-06-12T12:00:00Z', now)).toBe('Due Jun 12, 2027')
  })
})

describe('formatDate', () => {
  it('adds the year only outside the current one', () => {
    expect(formatDate('2026-09-19T12:00:00Z', now)).toBe('Sep 19')
    expect(formatDate('2027-06-12T12:00:00Z', now)).toBe('Jun 12, 2027')
  })
})

describe('sortLoops and summarize', () => {
  it('orders needs-you, priority, then due date', () => {
    const loops = [
      { ...base, id: 'w', status: 'WAITING' as const },
      { ...base, id: 'n-low', priority: 'low' as const },
      { ...base, id: 'n-crit', priority: 'critical' as const },
    ]
    expect(sortLoops(loops).map((l) => l.id)).toEqual(['n-crit', 'n-low', 'w'])
    expect(summarize(groupByStatus(loops))).toBe('2 things need you. 1 is waiting on others.')
    expect(summaryParts(groupByStatus(loops)).map((p) => p.section)).toEqual([
      'needs-you',
      'waiting',
    ])
    expect(summarize(groupByStatus([]))).toBe('Let’s find what needs your attention.')
    expect(summarize(groupByStatus([{ ...base, status: 'RESOLVED' }]))).toBe('Nothing needs you.')
  })
})

describe('groupByTime', () => {
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()
  it('buckets by day in the demo zone, with state as the marker', () => {
    const loops = [
      { ...base, id: 'late', dueAt: at(-1) },
      { ...base, id: 'club', status: 'WATCHING' as const, dueAt: at(-2) },
      { ...base, id: 'today', dueAt: at(0) },
      { ...base, id: 'week', dueAt: at(5) },
      { ...base, id: 'edge', dueAt: at(7) },
      { ...base, id: 'later', dueAt: at(30) },
      { ...base, id: 'undated' },
      { ...base, id: 'done', status: 'RESOLVED' as const, dueAt: at(-3) },
    ]
    const groups = groupByTime(loops, now)
    const ids = (b: Parameters<typeof groups.get>[0]) => groups.get(b)?.map((l) => l.id)
    expect(ids('overdue')).toEqual(['late'])
    expect(ids('earlier')).toEqual(['club'])
    expect(ids('today')).toEqual(['today'])
    expect(ids('week')).toEqual(['week', 'edge'])
    expect(ids('later')).toEqual(['later'])
    expect(ids('undated')).toEqual(['undated'])
    expect(ids('resolved')).toEqual(['done'])
  })
  it('orders a bucket by due date then priority', () => {
    const loops = [
      { ...base, id: 'b', dueAt: at(3), priority: 'low' as const },
      { ...base, id: 'a', dueAt: at(2), priority: 'low' as const },
      { ...base, id: 'c', dueAt: at(2), priority: 'critical' as const },
    ]
    expect(
      groupByTime(loops, now)
        .get('week')
        ?.map((l) => l.id),
    ).toEqual(['c', 'a', 'b'])
  })
  it('counts whole days across the demo zone midnight', () => {
    expect(daysUntil('2026-09-11T03:00:00Z', new Date('2026-09-10T12:00:00Z'))).toBe(0)
    expect(daysUntil('2026-09-11T05:00:00Z', new Date('2026-09-10T12:00:00Z'))).toBe(1)
  })
})
