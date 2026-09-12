import Link from 'next/link'
import { AgentToolbar } from '@/components/agent-toolbar'
import { LoopCard } from '@/components/loop-card'
import { StateIcon } from '@/components/loop-mark'
import { LoopSculpture } from '@/components/loop-sculpture'
import { KindBadge } from '@/components/status-chip'
import { scanConfigured } from '@/lib/agent'
import { DEMO_TIME_ZONE, formatDate, groupByStatus, STATUS_LABEL, STATUS_ORDER } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

const SECTIONS = {
  NEEDS_YOU: {
    id: 'needs-you',
    hint: 'A few things only you can move forward.',
    empty: 'Nothing needs you right now.',
  },
  WAITING: {
    id: 'waiting',
    hint: 'The next move belongs to someone else.',
    empty: 'You are not waiting on anyone.',
  },
  WATCHING: {
    id: 'watching',
    hint: 'On your radar. No action needed right now.',
    empty: 'Nothing to watch just yet.',
  },
  RESOLVED: {
    id: 'resolved',
    hint: 'Closed by evidence or by you.',
    empty: 'Closed loops will appear here.',
  },
  UNCERTAIN: {
    id: 'uncertain',
    hint: 'A quick check will help the agent get this right.',
    empty: '',
  },
} as const

export default async function Home() {
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 20 }),
  ])
  const groups = groupByStatus(loops)
  const recent = audit.filter((event) => event.kind !== 'evidence_added').slice(0, 3)
  const now = new Date()
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: DEMO_TIME_ZONE,
    }).format(now),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const needs = groups.get('NEEDS_YOU')?.length ?? 0
  const uncertain = groups.get('UNCERTAIN')?.length ?? 0
  const resolved = groups.get('RESOLVED') ?? []
  const critical =
    groups.get('NEEDS_YOU')?.filter((loop) => loop.priority === 'critical').length ?? 0
  const summary =
    loops.length === 0
      ? 'Let’s find what needs your attention.'
      : needs === 0
        ? 'Nothing needs you right now.'
        : `${needs} ${needs === 1 ? 'thing needs' : 'things need'} your attention.`

  return (
    <div className="dashboard">
      <div className="page-topline">
        <span>
          Your workspace <span className="breadcrumb-divider">/</span> <strong>Overview</strong>
        </span>
        <span className="demo-label">Demo workspace</span>
      </div>
      <section className="dashboard-intro" aria-labelledby="greeting">
        <div className="intro-copy">
          <p className="eyebrow">
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: DEMO_TIME_ZONE,
            })}
          </p>
          <h1 id="greeting">
            {greeting}, {USER_NAME}
            <span className="brand-dot">.</span>
          </h1>
          <p className="intro-summary">{summary}</p>
          <p className="intro-detail">
            {uncertain > 0
              ? `${uncertain} more ${uncertain === 1 ? 'needs' : 'need'} a closer look.`
              : critical > 0
                ? `${critical} ${critical === 1 ? 'is' : 'are'} marked critical. Start there.`
                : loops.length > 0
                  ? 'The rest is waiting, being watched, or already closed.'
                  : 'Your email and calendar, turned into clear next steps.'}
          </p>
        </div>
        <LoopSculpture />
      </section>
      <nav className="state-overview" aria-label="Loop summary">
        {STATUS_ORDER.filter((status) => status !== 'UNCERTAIN').map((status) => (
          <a
            key={status}
            href={`#${SECTIONS[status].id}`}
            className="state-stat"
            data-state={SECTIONS[status].id}
          >
            <span className="stat-label">
              <StateIcon name={SECTIONS[status].id} />
              {STATUS_LABEL[status]}
            </span>
            <span className="stat-bottom">
              <strong>{groups.get(status)?.length ?? 0}</strong>
              <span>
                {status === 'NEEDS_YOU'
                  ? 'Your next move'
                  : status === 'WAITING'
                    ? 'With someone else'
                    : status === 'WATCHING'
                      ? 'On your radar'
                      : 'Off your plate'}
              </span>
              <span className="stat-arrow" aria-hidden="true">
                ↗
              </span>
            </span>
          </a>
        ))}
      </nav>
      <AgentToolbar configured={scanConfigured} />
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
            const section = SECTIONS[status]
            const header = (
              <div key={`${status}-heading`} className="section-heading">
                <div>
                  <h2>
                    <span className="section-icon" data-state={section.id}>
                      <StateIcon name={section.id} />
                    </span>
                    {STATUS_LABEL[status]}
                    <span className="section-count">{items.length}</span>
                  </h2>
                  <p>{section.hint}</p>
                </div>
                {status === 'RESOLVED' && (
                  <span className="disclosure-arrow" aria-hidden="true">
                    ⌄
                  </span>
                )}
              </div>
            )
            const content =
              items.length === 0 ? (
                <p key={`${status}-empty`} className="section-empty">
                  {section.empty}
                </p>
              ) : (
                <div key={`${status}-list`} className="loop-list">
                  {items.map((loop) => (
                    <LoopCard key={loop.id} loop={loop} now={now} />
                  ))}
                </div>
              )
            return status === 'RESOLVED' ? (
              <details key={status} id={section.id} className="loop-section resolved-section">
                <summary>{header}</summary>
                {content}
              </details>
            ) : (
              <section key={status} id={section.id} className="loop-section">
                {header}
                {content}
              </section>
            )
          })}
        </div>
        <aside className="dashboard-context" aria-label="Recent progress">
          <section className="progress-note">
            <span className="progress-icon">
              <StateIcon name="resolved" />
            </span>
            <p className="eyebrow">A LITTLE MORE HEADSPACE</p>
            <h2>
              {resolved.length > 0 ? (
                <>
                  {`${resolved.length} ${resolved.length === 1 ? 'loop' : 'loops'} closed`}
                  <span className="brand-dot">.</span>
                </>
              ) : (
                'Room for what matters.'
              )}
            </h2>
            <p>
              {resolved.length > 0
                ? 'One less thing to remember, every time a loop closes.'
                : 'As responsibilities resolve, you can see what’s off your plate here.'}
            </p>
            {resolved.length > 0 && (
              <ul>
                {resolved.slice(0, 2).map((loop) => (
                  <li key={loop.id}>
                    <span aria-hidden="true">✓</span>
                    <Link href={`/loops/${loop.id}`}>{loop.title}</Link>
                  </li>
                ))}
              </ul>
            )}
            <a href="#resolved" className="text-link">
              View resolved loops <span aria-hidden="true">↗</span>
            </a>
          </section>
          <section className="recent-activity">
            <div className="context-heading">
              <h2>Recent activity</h2>
              <Link href="/activity" aria-label="View all activity">
                View all <span aria-hidden="true">↗</span>
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">
                The agent’s work will appear here after your first scan.
              </p>
            ) : (
              <ol>
                {recent.map((event) => (
                  <li key={event.id}>
                    <div>
                      <KindBadge kind={event.kind} />
                      <time dateTime={event.at}>{formatDate(event.at)}</time>
                    </div>
                    <p>
                      {event.loopId ? (
                        <Link href={`/loops/${event.loopId}`}>{event.reason}</Link>
                      ) : (
                        event.reason
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <p className="activity-footnote">
              Every change has a reason.
              <br />
              Every loop has a trail.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
