import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { ACTION_LABEL, formatDate, formatDue, formatMoney } from '@/lib/format'
import { PriorityDot } from './status-chip'

/** A readable title and its source, with the due date kept in a predictable position. Closed loops carry no urgency. */
export function LoopRow({ loop, now }: { loop: OpenLoop; now: Date }) {
  const needsUser = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  const due =
    loop.status === 'RESOLVED'
      ? undefined
      : needsUser
        ? formatDue(loop.dueAt, now)
        : loop.dueAt
          ? formatDate(loop.dueAt, now)
          : undefined
  const soon =
    needsUser &&
    due !== undefined &&
    (due === 'Due today' || due === 'Due tomorrow' || due.startsWith('Overdue'))
  const source =
    loop.status === 'WAITING' && loop.waitingOn ? `Waiting on ${loop.waitingOn}` : loop.requestedBy
  const action =
    loop.status === 'RESOLVED'
      ? undefined
      : (formatMoney(loop.amount) ?? (needsUser ? ACTION_LABEL[loop.actionType] : undefined))
  return (
    <Link href={`/loops/${loop.id}`} className="loop-row" data-soon={soon || undefined}>
      {loop.status === 'RESOLVED' ? (
        <span className="priority-dot" data-priority="resolved" aria-hidden="true" />
      ) : (
        <PriorityDot priority={loop.priority} />
      )}
      <span className="row-content">
        <span className="row-title">{loop.title}</span>
        {source && <span className="row-source">{source}</span>}
      </span>
      <span className="row-side">
        {due && <span className="row-due">{due}</span>}
        {action && <span className="row-action">{action}</span>}
      </span>
      <span className="row-arrow" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}
