import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { AreaIcon } from '@/components/loop-mark'
import { StatusChip } from '@/components/status-chip'
import {
  ACTION_LABEL,
  AREA_LABEL,
  formatDate,
  formatDue,
  formatMoney,
  groupByTime,
  TIME_LABEL,
  TIME_ORDER,
  type TimeBucket,
} from '@/lib/format'
import { hasSourcePage, messageHref } from '@/lib/source'
import { ListKeys } from './list-keys'

const STATE_ID: Record<OpenLoop['status'], string> = {
  NEEDS_YOU: 'needs-you',
  WAITING: 'waiting',
  WATCHING: 'watching',
  RESOLVED: 'resolved',
  UNCERTAIN: 'uncertain',
}

const EMPTY: Partial<Record<TimeBucket, string>> = {
  overdue: 'Nothing overdue.',
  today: 'Nothing due today.',
  week: 'Nothing due this week.',
}

/**
 * The overview as every product in this category opens: a list grouped by time. Each row reads in
 * fixed columns: the area of life, the title and who it is from, when it is due, the state. A title
 * opens the loop in the pane beside the list (a sheet on a phone); nothing on a row closes or
 * approves anything, so a slip cannot do damage. Buckets with nothing in them are shown only where
 * their emptiness is itself the news (overdue, today, this week).
 */
export function TodayList({
  loops,
  now,
  selected,
}: {
  loops: OpenLoop[]
  now: Date
  selected?: string
}) {
  const groups = groupByTime(loops, now)
  return (
    <div className="today-list">
      <ListKeys />
      {TIME_ORDER.map((bucket) => {
        const items = groups.get(bucket) ?? []
        if (items.length === 0 && !EMPTY[bucket]) return null
        const section = (
          <>
            <h2 className="tl-heading" data-bucket={bucket}>
              {TIME_LABEL[bucket]}
              <span>{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="tl-empty">{EMPTY[bucket]}</p>
            ) : (
              <ol className="tl-rows">
                {items.map((loop) => (
                  <Row key={loop.id} loop={loop} now={now} selected={loop.id === selected} />
                ))}
              </ol>
            )}
          </>
        )
        return bucket === 'resolved' ? (
          <details key={bucket} id={bucket} className="tl-section tl-resolved" open>
            <summary>{section}</summary>
          </details>
        ) : (
          <section key={bucket} id={bucket} className="tl-section">
            {section}
          </section>
        )
      })}
    </div>
  )
}

function Row({ loop, now, selected }: { loop: OpenLoop; now: Date; selected: boolean }) {
  const owed = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  const closed = loop.status === 'RESOLVED'
  const due = closed
    ? loop.resolvedAt
      ? `Closed ${formatDate(loop.resolvedAt, now)}`
      : undefined
    : owed
      ? formatDue(loop.dueAt, now)
      : loop.dueAt
        ? formatDate(loop.dueAt, now)
        : undefined
  const soon =
    owed &&
    due !== undefined &&
    (due === 'Due today' || due === 'Due tomorrow' || due.startsWith('Overdue'))
  const who =
    loop.status === 'WAITING' && loop.waitingOn ? `Waiting on ${loop.waitingOn}` : loop.requestedBy
  const verb = !closed && owed ? ACTION_LABEL[loop.actionType] : undefined
  const amount = closed ? undefined : formatMoney(loop.amount)
  const source = loop.sourceRefs.find((ref) => hasSourcePage(ref.sourceType))
  const what = [verb, amount].filter(Boolean).join(' ')
  return (
    <li
      className="tl-row"
      data-state={STATE_ID[loop.status]}
      data-soon={soon || undefined}
      data-loop-id={loop.id}
      data-selected={selected || undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="tl-area" title={AREA_LABEL[loop.area]}>
        <AreaIcon area={loop.area} />
      </span>
      <div className="tl-main">
        <Link href={`/?loop=${loop.id}`} className="tl-title" scroll={false}>
          {loop.title}
        </Link>
        <span className="tl-meta">
          {who && <span>{who}</span>}
          {what && <em>{what}</em>}
        </span>
      </div>
      <span className="tl-due">{due ?? ''}</span>
      <div className="tl-end">
        <span className="tl-chip">
          <StatusChip status={loop.status} />
        </span>
        <div className="tl-actions">
          <Link href={`/loops/${loop.id}`} className="tl-action">
            Open
          </Link>
          {source && (
            <Link href={messageHref(source.sourceId, loop.id)} className="tl-action">
              Source
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}
