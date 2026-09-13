import type { LoopStatus, OpenLoop } from '@openloop/shared'
import { LiveClock } from '@/components/live-clock'
import { DEMO_TIME_ZONE, summaryParts } from '@/lib/format'

/**
 * The top of a day: the date and clock, a greeting, and the one headline that says what needs
 * you (SPEC §8A). Each line links to its section of the list and wears its state colour.
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
  return (
    <section className="hero" aria-labelledby="headline" data-tour="headline">
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
      <h1 id="headline" className="hero-summary">
        {summaryParts(groups).map((part, index) => {
          const [, count, rest] = part.text.match(/^(\d+)\s(.*)$/) ?? []
          const line = count ? (
            <>
              <strong className="hero-count">{count}</strong> {rest}
            </>
          ) : (
            part.text
          )
          const style = { '--line': index } as React.CSSProperties
          return part.section ? (
            <a
              key={part.text}
              href={`#${part.section === 'needs-you' ? 'overdue' : 'week'}`}
              className="hero-line"
              data-state={part.section}
              style={style}
            >
              {line}
            </a>
          ) : (
            <span key={part.text} className="hero-line" style={style}>
              {line}
            </span>
          )
        })}
      </h1>
    </section>
  )
}
