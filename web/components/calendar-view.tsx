import type { OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { AreaIcon } from '@/components/loop-mark'
import { DEMO_TIME_ZONE, dayKey, formatDate } from '@/lib/format'

const STATE_ID: Record<OpenLoop['status'], string> = {
  NEEDS_YOU: 'needs-you',
  WAITING: 'waiting',
  WATCHING: 'watching',
  RESOLVED: 'resolved',
  UNCERTAIN: 'uncertain',
}
const WEEKS = 6

/**
 * Deadlines on a grid: six weeks from the start of this week, one cell per day, each loop on the
 * day it is due. A day's number opens that day's agenda beside the grid. What falls after the
 * grid, and what has no date, is listed underneath so nothing disappears just because it is far
 * off.
 */
export function CalendarView({
  loops,
  now,
  selected,
}: {
  loops: OpenLoop[]
  now: Date
  /** A day key, YYYY-MM-DD, whose agenda is open beside the grid. */
  selected?: string | undefined
}) {
  const today = dayKey(now)
  const [y, m, d] = today.split('-')
  const first = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7)) // back to Monday
  const addDays = (base: Date, count: number) => {
    const date = new Date(base)
    date.setUTCDate(base.getUTCDate() + count)
    return date
  }
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(first, i))
  const lastDay = addDays(first, WEEKS * 7 - 1)
  const key = (date: Date) => date.toISOString().slice(0, 10)
  const byDay = new Map<string, OpenLoop[]>()
  const beyond: OpenLoop[] = []
  const undated: OpenLoop[] = []
  const last = key(lastDay)
  for (const loop of loops) {
    if (!loop.dueAt) {
      if (loop.status !== 'RESOLVED') undated.push(loop)
      continue
    }
    const k = dayKey(loop.dueAt)
    if (k > last) beyond.push(loop)
    else byDay.set(k, [...(byDay.get(k) ?? []), loop])
  }
  beyond.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const range = `${first.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })} to ${lastDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}`

  return (
    <div className="calendar">
      <p className="cal-range">{range}</p>
      <table className="cal-grid">
        <caption className="sr-only">Deadlines, {range}</caption>
        <thead>
          <tr>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => (
              <th key={name} scope="col" className="cal-weekday">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: WEEKS }, (_, w) => (
            <tr key={key(addDays(first, w * 7))}>
              {days.slice(w * 7, w * 7 + 7).map((date, i) => {
                const k = key(date)
                const items = byDay.get(k) ?? []
                const firstOfMonth = date.getUTCDate() === 1 || (w === 0 && i === 0)
                return (
                  <td
                    key={k}
                    className="cal-day"
                    data-today={k === today || undefined}
                    data-past={k < today || undefined}
                    data-selected={k === selected || undefined}
                  >
                    <Link
                      href={`/calendar?day=${k}`}
                      className="cal-date cal-date-link"
                      scroll={false}
                      aria-label={`Open ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}`}
                    >
                      {firstOfMonth
                        ? date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })
                        : date.getUTCDate()}
                    </Link>
                    {items.map((loop) => (
                      <Link
                        key={loop.id}
                        href={`/loops/${loop.id}`}
                        className="cal-item"
                        data-state={STATE_ID[loop.status]}
                        title={loop.title}
                      >
                        {loop.area !== 'other' && (
                          <span className="cal-area" data-area={loop.area}>
                            <AreaIcon area={loop.area} />
                          </span>
                        )}
                        {loop.title}
                      </Link>
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {(beyond.length > 0 || undated.length > 0) && (
        <div className="cal-rest">
          {beyond.length > 0 && (
            <section>
              <h2>Later</h2>
              <ul>
                {beyond.map((loop) => (
                  <li key={loop.id}>
                    <Link href={`/loops/${loop.id}`} data-state={STATE_ID[loop.status]}>
                      {loop.title}
                    </Link>
                    <span>{loop.dueAt ? formatDate(loop.dueAt, now) : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {undated.length > 0 && (
            <section>
              <h2>No date</h2>
              <ul>
                {undated.map((loop) => (
                  <li key={loop.id}>
                    <Link href={`/loops/${loop.id}`} data-state={STATE_ID[loop.status]}>
                      {loop.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <p className="cal-note">
        Days follow {DEMO_TIME_ZONE.replace('_', ' ')}. Closed loops stay on the day they were due.
      </p>
    </div>
  )
}
