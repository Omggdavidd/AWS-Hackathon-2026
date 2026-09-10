import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { formatDue, formatMoney } from '@/lib/format'
import { PriorityDot } from './status-chip'

export function LoopCard({ loop, now }: { loop: OpenLoop; now: Date }) {
  const due = loop.status === 'RESOLVED' ? undefined : formatDue(loop.dueAt, now)
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
        <div className="flex items-center gap-2">
          <PriorityDot priority={loop.priority} />
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
