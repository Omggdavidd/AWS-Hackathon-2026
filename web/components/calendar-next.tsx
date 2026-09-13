import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { AreaIcon } from '@/components/loop-mark'
import { StatusChip } from '@/components/status-chip'
import { AREA_LABEL, dayKey, daysUntil, groupByTime } from '@/lib/format'

const SHOWN = 3

/**
 * What the calendar is for: the next deadlines, each opening its day, and how the rest of the
 * month is shaped. Replaces the agent controls here; those belong on Today.
 */
export function CalendarNext({ loops, now }: { loops: OpenLoop[]; now: Date }) {
  const today = dayKey(now)
  const upcoming = loops
    .filter((l) => l.status !== 'RESOLVED' && l.dueAt && dayKey(l.dueAt) >= today)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    .slice(0, SHOWN)
  const groups = groupByTime(loops, now)
  const n = (b: Parameters<typeof groups.get>[0]) => groups.get(b)?.length ?? 0
  const counts = [
    n('overdue') > 0 && { text: `${n('overdue')} overdue`, href: '/#overdue', tone: 'needs-you' },
    n('today') > 0 && { text: `${n('today')} due today`, href: `/calendar?day=${today}` },
    n('week') > 0 && { text: `${n('week')} due this week`, href: '/#week' },
    n('later') > 0 && { text: `${n('later')} later`, href: '/#later' },
    n('undated') > 0 && { text: `${n('undated')} without a date`, href: '/#undated' },
  ].filter((c): c is { text: string; href: string; tone?: string } => Boolean(c))

  return (
    <section className="next-up" aria-labelledby="next-up-heading">
      <div className="next-up-head">
        <h2 id="next-up-heading">Next up</h2>
        {counts.length > 0 && (
          <p className="next-up-counts">
            {counts.map((c, i) => (
              <span key={c.text}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <Link href={c.href} className="next-up-count" data-state={c.tone} scroll={false}>
                  {c.text}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
      {upcoming.length === 0 ? (
        <p className="next-up-empty">
          Nothing with a date ahead. Everything open is undated or already past.
        </p>
      ) : (
        <ol className="next-up-list">
          {upcoming.map((loop) => {
            const due = loop.dueAt ?? ''
            const days = daysUntil(due, now)
            const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
            const date = new Date(due).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: 'America/New_York',
            })
            return (
              <li key={loop.id}>
                <Link
                  href={`/calendar?day=${dayKey(due)}`}
                  className="next-up-card"
                  data-state={STATE_ID[loop.status]}
                  scroll={false}
                >
                  <span className="next-up-when">
                    <b>{when}</b>
                    <small>{date}</small>
                  </span>
                  <span className="next-up-main">
                    <span className="next-up-title">{loop.title}</span>
                    <span className="next-up-who">
                      <span
                        className="next-up-area"
                        data-area={loop.area}
                        title={AREA_LABEL[loop.area]}
                      >
                        <AreaIcon area={loop.area} />
                      </span>
                      {loop.status === 'WAITING' && loop.waitingOn
                        ? `Waiting on ${loop.waitingOn}`
                        : loop.requestedBy}
                    </span>
                  </span>
                  <StatusChip status={loop.status} />
                </Link>
              </li>
            )
          })}
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
