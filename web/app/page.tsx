import { cookies } from 'next/headers'
import { AgentPanel } from '@/components/agent-panel'
import { CalendarView } from '@/components/calendar-view'
import { ChangeBanner } from '@/components/change-banner'

import { LiveClock } from '@/components/live-clock'
import { LoopBoard } from '@/components/loop-board'
import { LoopRing } from '@/components/loop-mark'
import { TodayList } from '@/components/today-list'
import { parseView, ViewSwitch } from '@/components/view-switch'
import { scanConfigured } from '@/lib/agent'
import { summarizeChanges } from '@/lib/changes'

import { DEMO_TIME_ZONE, formatDateTime, groupByStatus, summaryParts } from '@/lib/format'

import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/**
 * The overview. Home is a list grouped by time with the state on each row, the way Things,
 * Todoist and Asana open; Board and Calendar are views on the same loops (SPEC §7, §8A).
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { view: rawView } = await searchParams
  const view = parseView(rawView)
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 40 }),
  ])
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  const checked = lastScan ? formatDateTime(lastScan.at) : undefined
  const now = new Date()
  const agent = <AgentPanel configured={scanConfigured} checked={checked} />

  if (view === 'board') {
    return (
      <LoopBoard
        loops={loops}
        now={now.toISOString()}
        name={USER_NAME}
        checked={checked}
        storageKey={`openloops:board:${USER_ID}:v1`}
        agent={agent}
      />
    )
  }

  const groups = groupByStatus(loops)
  const resolved = groups.get('RESOLVED')?.length ?? 0
  // Rendered only when something newer than the last dismissal happened, so there is no flash.
  const changed = summarizeChanges(audit, loops, now)
  const seen = (await cookies()).get('openloops-seen')?.value
  const banner = changed && (!seen || changed.latestAt > seen) ? changed : undefined
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: DEMO_TIME_ZONE,
    }).format(now),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="dashboard">
      {banner && <ChangeBanner sentences={banner.sentences} latestAt={banner.latestAt} />}
      <section className="hero" aria-labelledby="headline">
        <div className="hero-copy">
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
            {greeting}, {USER_NAME}.
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
        </div>
        <LoopRing closed={resolved} total={loops.length} />
      </section>
      {agent}
      <div className="view-bar">
        <ViewSwitch current={view} />
        {view === 'list' && (
          <p className="view-hint">
            Arrow keys move, Enter opens, <kbd>D</kbd> marks done.
          </p>
        )}
      </div>
      {view === 'calendar' ? (
        <CalendarView loops={loops} now={now} />
      ) : (
        <TodayList loops={loops} now={now} />
      )}
    </div>
  )
}
