import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { formatDate, formatDue, formatMoney } from '@/lib/format'
import { PriorityDot } from './status-chip'

export function LoopCard({ loop, now }: { loop: OpenLoop; now: Date }) {
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
  const meta = [formatMoney(loop.amount), loop.requestedBy].filter(Boolean)
  return (
    <Link
      href={`/loops/${loop.id}`}
      className="loop-card"
      data-priority={needsUser ? loop.priority : undefined}
    >
      <div className="card-heading">
        <span className="card-title">
          <PriorityDot priority={loop.priority} />
          {loop.title}
        </span>
        {due && <span className="due-label">{due}</span>}
      </div>
      {meta.length > 0 && <p className="card-meta">{meta.join(' · ')}</p>}
      {loop.waitingOn && <p className="card-meta">Waiting on {loop.waitingOn}</p>}
      {loop.nextAction && loop.status !== 'RESOLVED' && (
        <p className="card-next">
          <span aria-hidden="true">↳</span>
          {loop.nextAction}
        </p>
      )}
      <div className="card-footer">
        <span>
          {`${loop.sourceRefs.length} ${loop.sourceRefs.length === 1 ? 'source' : 'sources'} linked`}
        </span>
        <span className="card-review">
          {needsUser ? 'Review loop' : 'View details'} <span aria-hidden="true">↗</span>
        </span>
      </div>
    </Link>
  )
}
