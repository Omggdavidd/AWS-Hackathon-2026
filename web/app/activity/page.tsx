import type { AuditEvent, AuditKind } from '@openloop/shared'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { StateIcon } from '@/components/loop-mark'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import { DEMO_TIME_ZONE, humanize } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

const KIND: Record<AuditKind, { icon: string; label: string }> = {
  loop_created: { icon: 'overview', label: 'New loop' },
  state_changed: { icon: 'refresh', label: 'State changed' },
  evidence_added: { icon: 'list', label: 'Evidence' },
  action_proposed: { icon: 'decisions', label: 'Proposed' },
  action_approved: { icon: 'resolved', label: 'Approved' },
  action_executed: { icon: 'resolved', label: 'Done' },
  action_failed: { icon: 'needs-you', label: 'Failed' },
  action_cancelled: { icon: 'uncertain', label: 'Cancelled' },
  notification: { icon: 'mail', label: 'Notified' },
  scan_completed: { icon: 'refresh', label: 'Scan' },
  catch_up: { icon: 'digest', label: 'Catch-up' },
}

/**
 * What happened, as a timeline (SPEC §8F): one day at a time, an icon per kind of event, the
 * agent's moves told apart from yours, and every line that concerns a loop opening it.
 */
export default async function ActivityPage() {
  const jar = await cookies()
  const agentName = cleanAgentName(jar.get(AGENT_COOKIE)?.value) ?? 'Your agent'
  const store = await getStore()
  const [events, loops] = await Promise.all([
    store.listAudit(USER_ID, { limit: 120 }),
    store.listLoops(USER_ID),
  ])
  const titles = new Map(loops.map((l) => [l.id, l.title]))
  const shown = events.filter((e) => e.kind !== 'evidence_added')
  const days = new Map<string, AuditEvent[]>()
  for (const e of shown) {
    const day = new Date(e.at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: DEMO_TIME_ZONE,
    })
    days.set(day, [...(days.get(day) ?? []), e])
  }
  const actor = (e: AuditEvent) =>
    e.actor === 'user' ? 'You' : e.actor === 'agent' ? agentName : 'System'

  return (
    <div className="page-column activity">
      <header className="page-head">
        <h1>Activity</h1>
        <p>
          Everything {agentName} did, and everything you decided, with the reason. Newest first.
        </p>
      </header>
      {shown.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">Nothing has happened yet.</p>
          <p>
            Once {agentName} scans the inbox, every loop it opens, every state it changes and every
            action it proposes lands here with its reason.
          </p>
          <Link href="/" className="empty-link">
            Go to Today and press Scan inbox
          </Link>
        </div>
      )}
      {[...days].map(([day, items]) => (
        <section key={day} className="timeline-day" aria-label={day}>
          <h2>{day}</h2>
          <ol className="timeline">
            {items.map((e) => {
              const title = e.loopId ? titles.get(e.loopId) : undefined
              return (
                <li key={e.id} className="timeline-item" data-kind={e.kind} data-actor={e.actor}>
                  <span className="timeline-icon" aria-hidden="true">
                    <StateIcon name={KIND[e.kind].icon} />
                  </span>
                  <div className="timeline-body">
                    <p className="timeline-meta">
                      <time dateTime={e.at}>
                        {new Date(e.at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: DEMO_TIME_ZONE,
                        })}
                      </time>
                      <span className="timeline-actor">{actor(e)}</span>
                      <span className="timeline-kind">{KIND[e.kind].label}</span>
                    </p>
                    {title && (
                      <Link href={`/loops/${e.loopId}`} className="timeline-loop">
                        {title}
                      </Link>
                    )}
                    <p className="timeline-reason">{humanize(e.reason)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
