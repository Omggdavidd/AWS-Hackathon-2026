import type { OpenLoop } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { formatDue, groupByStatus, sortLoops, summarize, summaryParts } from './format'

const base: OpenLoop = {
  id: 'x',
  userId: 'u',
  title: 't',
  category: 'other',
  status: 'NEEDS_YOU',
  owner: 'user',
  actionType: 'none',
  riskLevel: 'low',
  priority: 'medium',
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
