import type { AuditEvent, OpenLoop } from '@openloop/shared'
import { NOTABLE } from './changes'

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
  latestAt?: string
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
 * the newest of them is the one worth telling. The policy for what counts as news has a single
 * owner, `NOTABLE` in `changes.ts`, so the bell and the banner can never disagree.
 *
 * `seen` is the timestamp of the last notice the user acknowledged, the same cookie the banner
 * writes when it is dismissed. Anything newer is unread; there is no read/unread column anywhere,
 * so nothing has to migrate and both ledger adapters work unchanged.
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
