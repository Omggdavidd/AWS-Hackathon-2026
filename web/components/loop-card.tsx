import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { formatDate, formatDue, formatMoney } from '@/lib/format'
import { PriorityDot } from './status-chip'

export function LoopCard({ loop, now }: { loop: OpenLoop; now: Date }) {
  // Overdue language only where the user owes the move; watched or waiting items just show their date.
  const due =
    loop.status === 'RESOLVED'
      ? undefined
      : loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
        ? formatDue(loop.dueAt, now)
        : loop.dueAt
          ? formatDate(loop.dueAt)
          : undefined
  const amount = formatMoney(loop.amount)
  const meta = [
    amount,
    loop.requestedBy,
    loop.waitingOn ? `Waiting on ${loop.waitingOn}` : undefined,
  ].filter(Boolean)
  return (
    <Link
      href={`/loops/${loop.id}`}
      className="block rounded-lg border border-border bg-card p-4 transition hover:border-stone-400 dark:hover:border-stone-500"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <span className="mt-2 flex shrink-0">
            <PriorityDot priority={loop.priority} />
          </span>
          <span className="font-medium">{loop.title}</span>
        </div>
        {due && <span className="shrink-0 text-sm text-muted">{due}</span>}
      </div>
      {meta.length > 0 && <p className="mt-1 pl-4 text-sm text-muted">{meta.join(' · ')}</p>}
      {loop.nextAction && loop.status !== 'RESOLVED' && (
        <p className="mt-2 pl-4 text-sm">{loop.nextAction}</p>
      )}
    </Link>
  )
}
