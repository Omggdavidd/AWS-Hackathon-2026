import type { ActionType, LoopArea, LoopStatus, Money, OpenLoop, Priority } from '@openloop/shared'

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

export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

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
  const days = daysUntil(dueAt, now)
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 14) return `Due in ${days} days`
  return `Due ${formatDate(dueAt, now)}`
}

/** "Sep 19" within the current year; "Jun 12, 2027" outside it, so a far-off date cannot read as near. */
export function formatDate(iso: string, now: Date = new Date()): string {
  const year = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: DEMO_TIME_ZONE }).format(d)
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year(date) === year(now) ? {} : { year: 'numeric' }),
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

/**
 * Text the model wrote with a machine id in it, made fit for a person: "Reply to thread thr-insurance
 * with the certificate" reads "Reply to the thread with the certificate". Older loops carry such ids;
 * the Risk Judge is now told not to write them.
 */
export function humanize(text: string): string {
  return text
    .replace(/\s*\((?:thr|msg|evt|cal)-[\w-]+\)/gi, '')
    .replace(/\b(thread|message|event)\s+(?:thr|msg|evt|cal)-[\w-]+/gi, 'the $1')
    .replace(/\b(?:thr|msg|evt|cal)-[\w-]+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

/** Confidence as a sentence: "Sure this is still open (97%)" rather than a bare percentage. */
export function confidenceSentence(confidence: number, resolved: boolean): string {
  const word = confidence >= 0.85 ? 'Sure' : confidence >= 0.6 ? 'Fairly sure' : 'Not sure'
  return `${word} this is ${resolved ? 'done' : 'still open'} (${formatPercent(confidence)})`
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

export type TimeBucket = 'overdue' | 'earlier' | 'today' | 'week' | 'later' | 'undated' | 'resolved'

export const TIME_ORDER: TimeBucket[] = [
  'overdue',
  'today',
  'week',
  'later',
  'undated',
  'earlier',
  'resolved',
]

export const TIME_LABEL: Record<TimeBucket, string> = {
  overdue: 'Overdue',
  earlier: 'Earlier',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  undated: 'No date',
  resolved: 'Resolved',
}

/** Calendar day in the demo zone as "YYYY-MM-DD", so buckets flip at local midnight, not UTC. */
export function dayKey(iso: string | Date, timeZone = DEMO_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(typeof iso === 'string' ? new Date(iso) : iso)
}

/** Whole days from `now` to `iso` in the demo zone; negative when past. */
export function daysUntil(iso: string, now: Date): number {
  const [y1, m1, d1] = dayKey(now).split('-')
  const [y2, m2, d2] = dayKey(iso).split('-')
  return Math.round(
    (Date.UTC(Number(y2), Number(m2) - 1, Number(d2)) -
      Date.UTC(Number(y1), Number(m1) - 1, Number(d1))) /
      86_400_000,
  )
}

/**
 * The overview's grouping: by time, with state as the marker on each row (Things, Todoist and
 * Asana all open this way). Overdue is only for loops the user owes; a past date on something the
 * user is merely watching or waiting on is "Earlier". Resolved loops sit apart at the end.
 */
export function groupByTime(loops: OpenLoop[], now: Date): Map<TimeBucket, OpenLoop[]> {
  const groups = new Map<TimeBucket, OpenLoop[]>(TIME_ORDER.map((b) => [b, []]))
  const bucket = (loop: OpenLoop): TimeBucket => {
    if (loop.status === 'RESOLVED') return 'resolved'
    if (!loop.dueAt) return 'undated'
    const days = daysUntil(loop.dueAt, now)
    const owed = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
    if (days < 0) return owed ? 'overdue' : 'earlier'
    if (days === 0) return 'today'
    if (days <= 7) return 'week'
    return 'later'
  }
  const sorted = [...loops].sort(
    (a, b) =>
      (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  )
  for (const loop of sorted) groups.get(bucket(loop))?.push(loop)
  return groups
}

/** How an area reads to a person. One owner for the words; the board and the rows share it. */
export const AREA_LABEL: Record<LoopArea, string> = {
  school: 'School',
  work: 'Work',
  money: 'Money',
  health: 'Health',
  home: 'Home',
  travel: 'Travel',
  community: 'Clubs',
  other: 'Other',
}
