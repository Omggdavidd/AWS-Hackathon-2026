import type { AuditEvent, AuditKind, OpenLoop } from '@openloop/shared'

/**
 * What counts as something the user should be told. Evidence, scans and catch-ups are the agent
 * working, not a change in the world; proposals and approvals are already visible as buttons on
 * the loop. SPEC §8H: notify state changes and decisions, never "you have 6 emails".
 */
export const NOTABLE: ReadonlySet<AuditKind> = new Set<AuditKind>([
  'state_changed',
  'loop_created',
  'action_executed',
])

/**
 * What the notice is about, which is also how it is coloured. The vocabulary is the product's
 * own: a notice names a loop and says what became of it.
 */
export type NoticeKind = 'new' | 'needs_you' | 'resolved' | 'handled' | 'waiting' | 'watching'

export type Notice = {
  /** The audit event this notice was built from, so the list never keys by array index. */
  id: string
  loopId: string
  title: string
  /** Reads as a sentence after the title: "Pay registration deposit is done." */
  text: string
  kind: NoticeKind
  at: string
  unread: boolean
  /**
   * Whether this notice may interrupt: the Risk Judge flagged the loop as needing a real decision
   * (`interruptUser`) *and* the news is that something is still owed. Good news never taps anyone
   * on the shoulder, so a loop that was flagged at creation and has since resolved goes quiet.
   */
  interrupts: boolean
}

export type NoticeFeed = {
  notices: Notice[]
  unread: number
  /** The newest notice's timestamp. Marking all as read stores this. Undefined when empty. */
  latestAt?: string | undefined
}

const LIMIT = 12

const TEXT: Record<NoticeKind, string> = {
  new: 'is new.',
  handled: 'was handled by the agent.',
  resolved: 'is done.',
  needs_you: 'needs you.',
  waiting: 'is waiting on someone.',
  watching: 'is being watched.',
}

/**
 * The notification centre, derived from the audit trail rather than stored (SPEC §8H). One notice
 * per loop, not per event: five things happening to one responsibility is one piece of news, and
 * the newest of them is the one worth telling.
 *
 * `seen` is the timestamp of the last notice the user acknowledged, written by "Mark all read".
 * Anything newer is unread; there is no read/unread column anywhere, so nothing has to migrate and
 * both ledger adapters work unchanged.
 */
export function buildNotices(
  audit: AuditEvent[],
  loops: OpenLoop[],
  seen?: string,
  limit = LIMIT,
): NoticeFeed {
  const byId = new Map(loops.map((loop) => [loop.id, loop]))
  const grouped = new Map<string, { newest: AuditEvent; created: boolean }>()

  for (const event of audit) {
    if (!NOTABLE.has(event.kind)) continue
    if (!event.loopId || !byId.has(event.loopId)) continue
    const current = grouped.get(event.loopId)
    const created = event.kind === 'loop_created' || current?.created === true
    if (!current || event.at > current.newest.at) {
      grouped.set(event.loopId, { newest: event, created })
    } else if (created !== current.created) {
      grouped.set(event.loopId, { ...current, created })
    }
  }

  const notices: Notice[] = []
  for (const [loopId, { newest, created }] of grouped) {
    const loop = byId.get(loopId)
    if (!loop) continue
    const kind = classify(loop.status, newest.kind, created)
    notices.push({
      id: newest.id,
      loopId,
      title: loop.title,
      text: TEXT[kind],
      kind,
      at: newest.at,
      unread: !seen || newest.at > seen,
      interrupts: loop.interruptUser && (kind === 'new' || kind === 'needs_you'),
    })
  }

  notices.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const shown = notices.slice(0, limit)
  return {
    notices: shown,
    // Counted over everything, not only the page shown, so the badge never under-reports.
    unread: notices.filter((notice) => notice.unread).length,
    latestAt: notices[0]?.at,
  }
}

/**
 * A loop that appeared in this run is news for appearing, whatever state it landed in; otherwise
 * the current state is the news. An executed action only speaks for itself when the loop it
 * belongs to is still open — once the loop is resolved, "is done" is the more useful sentence.
 */
function classify(
  status: OpenLoop['status'],
  kind: AuditEvent['kind'],
  created: boolean,
): NoticeKind {
  if (status === 'RESOLVED') return 'resolved'
  if (created) return 'new'
  if (kind === 'action_executed') return 'handled'
  if (status === 'NEEDS_YOU' || status === 'UNCERTAIN') return 'needs_you'
  if (status === 'WAITING') return 'waiting'
  return 'watching'
}

/**
 * The bubble that hangs off the bell is a headline, not the list: at most two categories and a
 * count, so it can be read without stopping. Most urgent first, because the one category that is
 * named should be the one worth acting on.
 */
const RANK: NoticeKind[] = ['needs_you', 'new', 'waiting', 'watching', 'handled', 'resolved']

/** The verb phrase that follows a count: 3 + " need you". */
const PHRASE: Record<NoticeKind, (count: number) => string> = {
  needs_you: (count) => (count === 1 ? 'needs you' : 'need you'),
  new: (count) => (count === 1 ? 'is new' : 'are new'),
  waiting: (count) => (count === 1 ? 'is waiting' : 'are waiting'),
  watching: (count) => (count === 1 ? 'is being watched' : 'are being watched'),
  handled: (count) => (count === 1 ? 'was handled' : 'were handled'),
  resolved: (count) => (count === 1 ? 'is done' : 'are done'),
}

/** A hard ceiling so the bubble never grows into a second banner. */
export const SUMMARY_CAP = 72

/**
 * One line for the bubble: "3 need you and 4 more are waiting." Only unread notices count, since
 * the bubble is what you have not looked at yet. Two categories are named; beyond that the rest
 * stay a number, because a bubble listing six categories is the banner we just removed.
 *
 * Returns undefined when nothing is unread, so the caller renders no bubble at all.
 */
export function summarizeNotices(notices: Notice[]): string | undefined {
  const unread = notices.filter((notice) => notice.unread)
  if (unread.length === 0) return undefined

  const counts = new Map<NoticeKind, number>()
  for (const notice of unread) counts.set(notice.kind, (counts.get(notice.kind) ?? 0) + 1)
  const ranked = RANK.filter((kind) => counts.has(kind))
  const first = ranked[0]
  if (!first) return undefined

  const lead = counts.get(first) ?? 0
  const head = `${lead} ${PHRASE[first](lead)}`
  const rest = unread.length - lead
  if (rest === 0) return cap(`${head}.`)

  const second = ranked[1]
  const tail =
    ranked.length === 2 && second ? `${rest} more ${PHRASE[second](rest)}` : `${rest} more changed`
  return cap(`${head} and ${tail}.`)
}

/** Truncate on a word boundary rather than mid-word, and say so with an ellipsis. */
function cap(text: string): string {
  if (text.length <= SUMMARY_CAP) return text
  const clipped = text.slice(0, SUMMARY_CAP - 1)
  const space = clipped.lastIndexOf(' ')
  return `${(space > 0 ? clipped.slice(0, space) : clipped).replace(/[.,]$/, '')}…`
}
