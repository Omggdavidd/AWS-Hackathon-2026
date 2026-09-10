import type { LoopStatus, Money, OpenLoop, Priority } from '@openloop/shared'

export const STATUS_ORDER: LoopStatus[] = [
  'NEEDS_YOU',
  'WAITING',
  'WATCHING',
  'RESOLVED',
  'UNCERTAIN',
]

export const STATUS_LABEL: Record<LoopStatus, string> = {
  NEEDS_YOU: 'Needs you',
  WAITING: 'Waiting',
  WATCHING: 'Watching',
  RESOLVED: 'Resolved',
  UNCERTAIN: 'Uncertain',
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/** Needs-you first, then by priority, then by due date. Deterministic for the demo. */
export function sortLoops(loops: OpenLoop[]): OpenLoop[] {
  return [...loops].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'),
  )
}

export function groupByStatus(loops: OpenLoop[]): Map<LoopStatus, OpenLoop[]> {
  const groups = new Map<LoopStatus, OpenLoop[]>(STATUS_ORDER.map((s) => [s, []]))
  for (const loop of sortLoops(loops)) groups.get(loop.status)?.push(loop)
  return groups
}

export function formatMoney(m: Money | undefined): string | undefined {
  if (!m) return undefined
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency }).format(m.value)
}

/** "Due in 3 days", "Due today", "Overdue by 2 days". `now` is injectable for tests and the demo clock. */
export function formatDue(dueAt: string | undefined, now: Date): string | undefined {
  if (!dueAt) return undefined
  const day = (d: Date) => Math.floor(d.getTime() / 86_400_000)
  const days = day(new Date(dueAt)) - day(now)
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 14) return `Due in ${days} days`
  return `Due ${new Date(dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

/** One-line summary for the top of the dashboard (SPEC §8A). */
export function summarize(groups: Map<LoopStatus, OpenLoop[]>): string {
  const needs = groups.get('NEEDS_YOU')?.length ?? 0
  const waiting = groups.get('WAITING')?.length ?? 0
  const critical = groups.get('NEEDS_YOU')?.filter((l) => l.priority === 'critical').length ?? 0
  const parts = [
    needs === 0
      ? 'Nothing needs you.'
      : `${needs} thing${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you.`,
    waiting === 0 ? '' : `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting on others.`,
    critical === 0 ? 'Nothing critical.' : `${critical} critical.`,
  ]
  return parts.filter(Boolean).join(' ')
}
