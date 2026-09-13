import { cookies } from 'next/headers'
import Link from 'next/link'
import { AgentPanel } from '@/components/agent-panel'
import { CalendarAgenda } from '@/components/calendar-agenda'
import { CalendarView } from '@/components/calendar-view'
import { Headline } from '@/components/headline'
import { scanConfigured } from '@/lib/agent'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import { formatDateTime, groupByStatus } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/** Deadlines on a six-week grid, with the same headline and agent controls as Today. */
export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const { day: rawDay } = await searchParams
  const selected =
    typeof rawDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : undefined
  const agentName = cleanAgentName((await cookies()).get(AGENT_COOKIE)?.value)
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 40 }),
  ])
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  const checked = lastScan ? formatDateTime(lastScan.at) : undefined
  const now = new Date()
  return (
    <div className="today calendar-page" data-open={selected ? '' : undefined}>
      <section className="today-main" aria-label="Calendar">
        <Headline groups={groupByStatus(loops)} name={USER_NAME} now={now} />
        <AgentPanel configured={scanConfigured} checked={checked} name={agentName} />
        <CalendarView loops={loops} now={now} selected={selected} />
      </section>
      {selected && (
        <aside className="pane" aria-label="Agenda">
          <div className="pane-inner">
            <div className="pane-bar">
              <Link href="/calendar" className="pane-close" scroll={false}>
                ← Back to the month
              </Link>
            </div>
            <CalendarAgenda day={selected} loops={loops} now={now} />
          </div>
        </aside>
      )}
    </div>
  )
}
