import type { LoopStatus, OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import { AgentToolbar } from '@/components/agent-toolbar'
import { LoopRing, StateIcon } from '@/components/loop-mark'
import { LoopRow } from '@/components/loop-row'
import { KindBadge } from '@/components/status-chip'
import { scanConfigured } from '@/lib/agent'
import {
  DEMO_TIME_ZONE,
  formatDate,
  groupByStatus,
  STATUS_LABEL,
  STATUS_ORDER,
  summaryParts,
} from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

const SECTIONS = {
  NEEDS_YOU: { id: 'needs-you', empty: 'Nothing needs you right now.' },
  WAITING: { id: 'waiting', empty: 'You are not waiting on anyone.' },
  WATCHING: { id: 'watching', empty: 'Nothing to watch yet.' },
  RESOLVED: { id: 'resolved', empty: 'Closed loops will appear here.' },
  UNCERTAIN: { id: 'uncertain', empty: '' },
} as const

/** Background events are not changes the user needs to see on the overview. */
const QUIET_KINDS = new Set(['evidence_added', 'scan_completed', 'catch_up'])

export default async function Home() {
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 40 }),
  ])
  const groups = groupByStatus(loops)
  const titles = new Map(loops.map((loop) => [loop.id, loop.title]))
  const seenLoops = new Set<string>()
  const changes = audit
    .filter((event) => {
      if (QUIET_KINDS.has(event.kind)) return false
      const key = event.loopId ?? event.id
      if (seenLoops.has(key)) return false
      seenLoops.add(key)
      return true
    })
    .slice(0, 4)
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  const now = new Date()
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: DEMO_TIME_ZONE,
    }).format(now),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const resolved = groups.get('RESOLVED')?.length ?? 0

  return (
    <div className="dashboard">
      <section className="hero" aria-labelledby="greeting">
        <div className="hero-copy">
          <p className="hero-date">
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: DEMO_TIME_ZONE,
            })}
          </p>
          <h1 id="greeting">
            {greeting}, {USER_NAME}.
          </h1>
          <p className="hero-summary">
            {summaryParts(groups).map((part) =>
              part.section ? (
                <a key={part.text} href={`#${part.section}`}>
                  {part.text}
                </a>
              ) : (
                <span key={part.text}>{part.text}</span>
              ),
            )}
          </p>
        </div>
        <LoopRing closed={resolved} total={loops.length} />
      </section>
      <AgentToolbar
        configured={scanConfigured}
        checked={lastScan ? formatDate(lastScan.at) : undefined}
      />
      <div className="dashboard-columns">
        <div className="loop-sections">
          {loops.length === 0 && (
            <div className="onboarding-note">
              <StateIcon name="overview" />
              <div>
                <h2>Less to keep in your head.</h2>
                <p>
                  Start with Scan inbox. Open Loops finds responsibilities, checks the evidence, and
                  brings you the next step.
                </p>
              </div>
            </div>
          )}
          {STATUS_ORDER.map((status) => {
            const items = groups.get(status) ?? []
            if (status === 'UNCERTAIN' && items.length === 0) return null
            return <LoopSection key={status} status={status} items={items} now={now} />
          })}
        </div>
        <aside className="dashboard-context" aria-labelledby="changes-heading">
          <div className="context-heading">
            <h2 id="changes-heading">Recent activity</h2>
            <Link href="/activity">All activity</Link>
          </div>
          {changes.length === 0 ? (
            <p className="section-empty">The agent’s work will show here after your first scan.</p>
          ) : (
            <ol className="change-list">
              {changes.map((event) => (
                <li key={event.id}>
                  <div className="change-meta">
                    <KindBadge kind={event.kind} />
                    <time dateTime={event.at}>{formatDate(event.at)}</time>
                  </div>
                  {event.loopId && titles.has(event.loopId) && (
                    <Link className="change-title" href={`/loops/${event.loopId}`}>
                      {titles.get(event.loopId)}
                    </Link>
                  )}
                  <p className="change-reason">{event.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  )
}

function LoopSection({ status, items, now }: { status: LoopStatus; items: OpenLoop[]; now: Date }) {
  const section = SECTIONS[status]
  const header = (
    <h2 className="section-heading" data-state={section.id}>
      <StateIcon name={section.id} />
      <span className="section-label">{STATUS_LABEL[status]}</span>
      <span className="section-count">{items.length}</span>
      {status === 'RESOLVED' && (
        <span className="disclosure-arrow" aria-hidden="true">
          ⌄
        </span>
      )}
    </h2>
  )
  const content =
    items.length === 0 ? (
      <p className="section-empty">{section.empty}</p>
    ) : (
      <div className="loop-list">
        {items.map((loop) => (
          <LoopRow key={loop.id} loop={loop} now={now} />
        ))}
      </div>
    )
  return status === 'RESOLVED' ? (
    <details id={section.id} className="loop-section resolved-section" open>
      <summary>{header}</summary>
      {content}
    </details>
  ) : (
    <section id={section.id} className="loop-section">
      {header}
      {content}
    </section>
  )
}
