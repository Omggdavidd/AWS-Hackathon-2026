import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { ACTION_LABEL, formatDate, formatDue, formatMoney } from '@/lib/format'
import { PriorityDot } from './status-chip'

/**
 * One loop, one line: what it is, the verb and one fact, when. The agent's reasoning and its
 * next-action prose stay on the loop page; this row exists to be scanned, not read.
 */
export function LoopRow({ loop, now }: { loop: OpenLoop; now: Date }) {
  // Overdue language only where the user owes the move.
  const needsUser = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  const due =
    loop.status === 'RESOLVED'
      ? undefined
      : needsUser
        ? formatDue(loop.dueAt, now)
        : loop.dueAt
          ? formatDate(loop.dueAt)
          : undefined
  const soon =
    needsUser && due !== undefined && !due.startsWith('Due in') && !due.startsWith('Due ')
  const verb = loop.status === 'RESOLVED' ? undefined : ACTION_LABEL[loop.actionType]
  const fact =
    loop.status === 'WAITING' && loop.waitingOn
      ? `With ${loop.waitingOn}`
      : (formatMoney(loop.amount) ?? loop.requestedBy)
  return (
    <Link
      href={`/loops/${loop.id}`}
      className="loop-row"
      data-soon={soon || undefined}
      title={loop.title}
    >
      <PriorityDot priority={loop.priority} />
      <span className="row-title">{loop.title}</span>
      <span className="row-fact">
        {verb && <em>{verb}</em>}
        {fact && <span>{fact}</span>}
      </span>
      {due && <span className="row-due">{due}</span>}
    </Link>
  )
}
