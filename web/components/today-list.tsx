import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { markDone } from '@/app/actions'
import { StateIcon } from '@/components/loop-mark'
import { SubmitButton } from '@/components/submit-button'
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
 * The overview as every product in this category opens: a list grouped by time, with the state as
 * the marker on each row and the action one hover away. Buckets with nothing in them are shown
 * only where their emptiness is itself the news (overdue, today, this week).
 */
export function TodayList({ loops, now }: { loops: OpenLoop[]; now: Date }) {
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
                  <Row key={loop.id} loop={loop} now={now} />
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

function Row({ loop, now }: { loop: OpenLoop; now: Date }) {
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
  return (
    <li className="tl-row" data-state={STATE_ID[loop.status]} data-soon={soon || undefined}>
      <span className="tl-state" title={loop.status.replace('_', ' ').toLowerCase()}>
        <StateIcon name={STATE_ID[loop.status]} />
      </span>
      <div className="tl-main">
        <Link href={`/loops/${loop.id}`} className="tl-title">
          {loop.title}
        </Link>
        <span className="tl-meta">
          {loop.area !== 'other' && (
            <span className="area-pill" data-area={loop.area}>
              {AREA_LABEL[loop.area]}
            </span>
          )}
          {verb && <em>{verb}</em>}
          {amount && <span>{amount}</span>}
          {who && <span>{who}</span>}
        </span>
      </div>
      {due && <span className="tl-due">{due}</span>}
      <div className="tl-actions">
        {source && (
          <Link href={messageHref(source.sourceId, loop.id)} className="tl-action">
            Source
          </Link>
        )}
        {!closed && (
          <form action={markDone.bind(null, loop.id)} className="tl-done">
            <SubmitButton pendingLabel="Saving…" subtle>
              Done
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  )
}
