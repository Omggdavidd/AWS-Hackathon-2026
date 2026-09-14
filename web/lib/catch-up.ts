import type { CatchUpSummary, OpenLoop } from '@openloop/shared'
import { daysUntil, formatDate, formatDue, PRIORITY_RANK } from './format'

/** How soon a catch-up item wants the person, most pressing first. */
export type Urgency = 'now' | 'soon' | 'later' | 'closed'

export const URGENCY_ORDER: Urgency[] = ['now', 'soon', 'later', 'closed']

export const URGENCY_LABEL: Record<Urgency, string> = {
  now: 'Urgent',
  soon: 'Soon',
  later: 'Can wait',
  closed: 'Closed',
}

export type CatchUpItem = CatchUpSummary['items'][number] & {
  /** "Overdue by 2 days", "Due tomorrow": the reason an item sits where it does, when it has a date. */
  due?: string
}

export type GroupedCatchUp = {
  headline: string
  groups: { urgency: Urgency; items: CatchUpItem[] }[]
  nothingElse: boolean
}

/**
 * Where an item belongs, read from the loop in the ledger rather than from the model's label, since
 * the ledger holds the state, the date and the priority the Risk Judge set. Urgent is the person's
 * own move that is overdue, due by tomorrow, or critical; Soon is any other move of theirs, or
 * anything else coming up within the week; the rest can wait, including a watched date that has
 * already passed. An item whose loop is gone falls back on its kind.
 */
export function urgencyOf(
  item: CatchUpSummary['items'][number],
  loop: OpenLoop | undefined,
  now: Date,
): Urgency {
  if (!loop) {
    if (item.kind === 'resolved') return 'closed'
    return item.kind === 'needs_you' || item.kind === 'deadline' ? 'soon' : 'later'
  }
  if (loop.status === 'RESOLVED') return 'closed'
  const owed = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  const days = loop.dueAt ? daysUntil(loop.dueAt, now) : undefined
  if (owed && ((days !== undefined && days <= 1) || loop.priority === 'critical')) return 'now'
  if (owed || (days !== undefined && days >= 0 && days <= 7) || loop.priority === 'high')
    return 'soon'
  return 'later'
}

/**
 * Catch me up grouped by urgency (SPEC §8D): the model writes the digest from the ledger, and the
 * app sorts it into what needs you now, soon, what can wait and what closed, soonest due first
 * inside each group. Empty groups are dropped.
 */
export function groupCatchUp(
  summary: CatchUpSummary,
  loops: OpenLoop[],
  now: Date,
): GroupedCatchUp {
  const byId = new Map(loops.map((loop) => [loop.id, loop]))
  const buckets = new Map<Urgency, { item: CatchUpItem; loop: OpenLoop | undefined }[]>()
  for (const item of summary.items) {
    const loop = byId.get(item.loopId)
    const urgency = urgencyOf(item, loop, now)
    const due = dueText(loop, now)
    const entry = { item: due ? { ...item, due } : item, loop }
    buckets.set(urgency, [...(buckets.get(urgency) ?? []), entry])
  }
  return {
    headline: summary.headline,
    nothingElse: summary.nothingElse,
    groups: URGENCY_ORDER.flatMap((urgency) => {
      const entries = buckets.get(urgency)
      if (!entries?.length) return []
      entries.sort(
        (a, b) =>
          (a.loop?.dueAt ?? '9999').localeCompare(b.loop?.dueAt ?? '9999') ||
          PRIORITY_RANK[a.loop?.priority ?? 'low'] - PRIORITY_RANK[b.loop?.priority ?? 'low'],
      )
      return [{ urgency, items: entries.map((e) => e.item) }]
    }),
  }
}

/** As on the list rows: overdue language only where the person owes the move, a plain date otherwise. */
function dueText(loop: OpenLoop | undefined, now: Date): string | undefined {
  if (!loop?.dueAt || loop.status === 'RESOLVED') return undefined
  const owed = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  return owed ? formatDue(loop.dueAt, now) : formatDate(loop.dueAt, now)
}
