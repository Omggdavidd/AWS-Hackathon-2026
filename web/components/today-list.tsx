import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { ActionIcon, AreaIcon } from '@/components/loop-mark'
import { StatusChip } from '@/components/status-chip'
import { SwipeRow } from '@/components/swipe-row'
import { UndoToast } from '@/components/undo-toast'
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

/** Where to look next when a bucket is empty: the nearest later bucket that has something. */
const NEXT: Partial<Record<TimeBucket, TimeBucket[]>> = {
  overdue: ['today', 'week'],
  today: ['week', 'later'],
  week: ['later', 'undated'],
}

function emptyCopy(bucket: TimeBucket, groups: Map<TimeBucket, OpenLoop[]>) {
  const base = EMPTY[bucket]
  const next = (NEXT[bucket] ?? []).find((b) => (groups.get(b)?.length ?? 0) > 0)
  if (!next) return base
  const n = groups.get(next)?.length ?? 0
  const where =
    next === 'today'
      ? 'due today'
      : next === 'week'
        ? 'due this week'
        : next === 'later'
          ? 'due later'
          : 'without a date'
  return (
    <>
      {base}{' '}
      <a href={`#${next}`} className="tl-empty-link">
        {n} {where}
      </a>
      .
    </>
  )
}

/**
 * The overview as every product in this category opens: a list grouped by time. Each row reads in
 * fixed columns: the area of life, the title and who it is from, when it is due, the state. A title
 * opens the loop in the pane beside the list (a sheet on a phone). Done and Snooze are a swipe or
 * a hover away, each with an Undo, so a slip is one click from repaired; Approve never is. Buckets
 * with nothing in them are shown only where their emptiness is itself the news (overdue, today,
 * this week).
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
  if (loops.length === 0) {
    return (
      <div className="today-list">
        <div className="empty-state" data-tour="row">
          <p className="empty-title">Nothing tracked yet.</p>
          <p>
            Scan inbox reads the mail and the calendar, keeps every responsibility that is still
            open, and sorts it by when it matters. The first scan takes about four minutes; after
            that, Check for new mail is a few seconds.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="today-list">
      <ListKeys />
      <UndoToast />
      {TIME_ORDER.map((bucket) => {
        const items = groups.get(bucket) ?? []
        if (items.length === 0 && !EMPTY[bucket]) return null
        const offset = TIME_ORDER.slice(0, TIME_ORDER.indexOf(bucket)).reduce(
          (n, b) => n + (groups.get(b)?.length ?? 0),
          0,
        )
        const section = (
          <>
            <h2 className="tl-heading" data-bucket={bucket}>
              {TIME_LABEL[bucket]}
              <span>{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="tl-empty">{emptyCopy(bucket, groups)}</p>
            ) : (
              <ol className="tl-rows">
                {items.map((loop, i) => (
                  <Row
                    key={loop.id}
                    loop={loop}
                    now={now}
                    selected={loop.id === selected}
                    first={
                      i === 0 && bucket === TIME_ORDER.find((b) => (groups.get(b)?.length ?? 0) > 0)
                    }
                    index={offset + i}
                  />
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

function Row({
  loop,
  now,
  selected,
  first,
  index,
}: {
  loop: OpenLoop
  now: Date
  selected: boolean
  first: boolean
  index: number
}) {
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
  const verbIcon = !closed && owed ? loop.actionType : undefined
  return (
    <SwipeRow
      loopId={loop.id}
      status={loop.status}
      closed={closed}
      openHref={`/loops/${loop.id}`}
      sourceHref={source ? messageHref(source.sourceId, loop.id) : undefined}
      className="tl-row"
      data-state={STATE_ID[loop.status]}
      data-soon={soon ? '' : undefined}
      data-loop-id={loop.id}
      data-selected={selected ? '' : undefined}
      data-tour={first ? 'row' : undefined}
      aria-current={selected ? 'true' : undefined}
      index={index}
    >
      <span className="tl-area" data-area={loop.area} title={AREA_LABEL[loop.area]}>
        <AreaIcon area={loop.area} />
      </span>
      <div className="tl-main">
        <Link href={`/?loop=${loop.id}`} className="tl-title" scroll={false}>
          {loop.title}
        </Link>
        <span className="tl-meta">
          {who && <span>{who}</span>}
          {what && (
            <em>
              {verbIcon && <ActionIcon action={verbIcon} className="tl-verb-icon" />}
              {what}
            </em>
          )}
        </span>
      </div>
      <span className="tl-due">{due ?? ''}</span>
      <span className="tl-chip">
        <StatusChip status={loop.status} />
      </span>
    </SwipeRow>
  )
}
