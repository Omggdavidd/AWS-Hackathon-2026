import type { ActionType, LoopStatus, Money, OpenLoop, Priority } from '@openloop/shared'

/**
 * The demo's clock. Every fixture date carries a -04:00 offset and the demo script says the club
 * meeting is 5:00-6:00 PM, so times are rendered in Eastern rather than in whatever zone the
 * server happens to run. Vercel runs UTC, which would otherwise print 9:00 PM for that meeting.
 */
export const DEMO_TIME_ZONE = 'America/New_York'

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
  return `Due ${formatDate(dueAt)}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: DEMO_TIME_ZONE,
  })
}

/** Date and time of day, for a page that has to agree with what the source actually says. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DEMO_TIME_ZONE,
  })
}

export function formatPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

/** How each action type reads as the verb on a dashboard row. `none` has no verb. */
export const ACTION_LABEL: Record<ActionType, string | undefined> = {
  pay: 'Pay',
  reply: 'Reply',
  submit: 'Submit',
  sign: 'Sign',
  choose: 'Choose',
  review: 'Review',
  confirm: 'Confirm',
  attend: 'Attend',
  book: 'Book',
  return: 'Return',
  none: undefined,
}

export type SummaryPart = { text: string; section?: string }

/**
 * The one sentence at the top of the dashboard (SPEC §8A), as fragments so each can link to its
 * section. Only states with something in them get a fragment; an empty ledger gets an invitation.
 */
export function summaryParts(groups: Map<LoopStatus, OpenLoop[]>): SummaryPart[] {
  const count = (status: LoopStatus) => groups.get(status)?.length ?? 0
  const needs = count('NEEDS_YOU')
  const waiting = count('WAITING')
  const watching = count('WATCHING')
  const uncertain = count('UNCERTAIN')
  if (needs + waiting + watching + uncertain + count('RESOLVED') === 0)
    return [{ text: 'Let’s find what needs your attention.' }]
  const parts: SummaryPart[] = [
    needs === 0
      ? { text: 'Nothing needs you.' }
      : {
          text: `${needs} thing${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you.`,
          section: 'needs-you',
        },
  ]
  if (waiting > 0)
    parts.push({
      text: `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting on others.`,
      section: 'waiting',
    })
  if (watching > 0) parts.push({ text: `${watching} on your radar.`, section: 'watching' })
  if (uncertain > 0)
    parts.push({
      text: `${uncertain} need${uncertain === 1 ? 's' : ''} a quick check.`,
      section: 'uncertain',
    })
  return parts
}

/** The sentence as plain text. */
export function summarize(groups: Map<LoopStatus, OpenLoop[]>): string {
  return summaryParts(groups)
    .map((p) => p.text)
    .join(' ')
}
