import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { AreaIcon } from '@/components/loop-mark'
import { StatusChip } from '@/components/status-chip'
import { AREA_LABEL, dayKey, daysUntil } from '@/lib/format'

/**
 * One day, beside the grid: what is due, who it is from, and its state, each line opening its
 * loop. An empty day says so and points at the next day that has something.
 */
export function CalendarAgenda({ day, loops, now }: { day: string; loops: OpenLoop[]; now: Date }) {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const title = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const due = loops
    .filter((loop) => loop.dueAt && dayKey(loop.dueAt) === day)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const offset = daysUntil(`${day}T12:00:00.000Z`, now)
  const relative =
    offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset === -1 ? 'Yesterday' : undefined
  const next = loops
    .filter((loop) => loop.dueAt && dayKey(loop.dueAt) > day && loop.status !== 'RESOLVED')
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))[0]

  return (
    <section className="agenda" aria-labelledby="agenda-heading">
      <p className="agenda-kicker">{relative ?? 'Agenda'}</p>
      <h1 id="agenda-heading">{title}</h1>
      {due.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Nothing due on this day.</p>
          {next?.dueAt && (
            <p>
              Next up:{' '}
              <Link
                href={`/calendar?day=${dayKey(next.dueAt)}`}
                className="empty-link"
                scroll={false}
              >
                {next.title}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <ol className="agenda-list">
          {due.map((loop) => (
            <li key={loop.id} className="agenda-item" data-state={STATE_ID[loop.status]}>
              <span className="tl-area" data-area={loop.area} title={AREA_LABEL[loop.area]}>
                <AreaIcon area={loop.area} />
              </span>
              <div className="agenda-main">
                <Link href={`/loops/${loop.id}`} className="agenda-title">
                  {loop.title}
                </Link>
                {(loop.requestedBy || loop.waitingOn) && (
                  <p className="agenda-who">
                    {loop.status === 'WAITING' && loop.waitingOn
                      ? `Waiting on ${loop.waitingOn}`
                      : loop.requestedBy}
                  </p>
                )}
              </div>
              <StatusChip status={loop.status} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const STATE_ID: Record<OpenLoop['status'], string> = {
  NEEDS_YOU: 'needs-you',
  WAITING: 'waiting',
  WATCHING: 'watching',
  RESOLVED: 'resolved',
  UNCERTAIN: 'uncertain',
}
