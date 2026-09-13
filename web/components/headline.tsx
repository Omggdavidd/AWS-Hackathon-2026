import type { LoopStatus, OpenLoop } from '@openloop/shared'
import { LiveClock } from '@/components/live-clock'
import { DEMO_TIME_ZONE, summarize } from '@/lib/format'

type Segment = {
  status: LoopStatus
  id: string
  word: (n: number) => string
  href: string
}

/** Left to right: your move first, then what the world owes you, then what is only watched, then done. */
const SEGMENTS: Segment[] = [
  {
    status: 'NEEDS_YOU',
    id: 'needs-you',
    word: (n) => (n === 1 ? 'needs you' : 'need you'),
    href: '#overdue',
  },
  {
    status: 'UNCERTAIN',
    id: 'uncertain',
    word: (n) => (n === 1 ? 'needs a check' : 'need a check'),
    href: '#week',
  },
  { status: 'WAITING', id: 'waiting', word: () => 'waiting on others', href: '#week' },
  { status: 'WATCHING', id: 'watching', word: () => 'on your radar', href: '#later' },
  { status: 'RESOLVED', id: 'resolved', word: () => 'closed', href: '#resolved' },
]

/**
 * The top of a day: the date and clock, a greeting, and the day's loops as one bar, a segment per
 * state, widest where there are most (SPEC §8A). The number under each segment is the headline;
 * what needs you is first and heaviest, what is closed trails off. The full sentence is kept for
 * screen readers. Each segment jumps to its part of the list.
 */
export function Headline({
  groups,
  name,
  now,
}: {
  groups: Map<LoopStatus, OpenLoop[]>
  name: string
  now: Date
}) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: DEMO_TIME_ZONE,
    }).format(now),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const counts = SEGMENTS.map((s) => ({ ...s, n: groups.get(s.status)?.length ?? 0 }))
  const total = counts.reduce((sum, s) => sum + s.n, 0)
  const shown = counts.filter((s) => s.n > 0)

  return (
    <section className="daybar" aria-labelledby="headline" data-tour="headline">
      <div className="daybar-top">
        <p className="hero-date">
          <span>
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: DEMO_TIME_ZONE,
            })}
          </span>
          <LiveClock timeZone={DEMO_TIME_ZONE} />
        </p>
        <p className="hero-greeting">
          {greeting}, {name}.
        </p>
      </div>
      <h1 id="headline" className="sr-only">
        {summarize(groups)}
      </h1>
      {total === 0 ? (
        <p className="daybar-empty">Nothing tracked yet. Scan the inbox to find what is open.</p>
      ) : (
        <div className="daybar-track" aria-hidden="true">
          {shown.map((s, i) => (
            <a
              key={s.id}
              href={s.href}
              className="daybar-seg"
              data-state={s.id}
              style={{ '--n': s.n, '--i': i } as React.CSSProperties}
            >
              <b className="daybar-num">{s.n}</b>
              <span className="daybar-word">
                {s.word(s.n)}
                {s.status === 'RESOLVED' && <small className="daybar-of"> of {total}</small>}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
