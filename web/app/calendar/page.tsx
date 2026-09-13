import { AgentPanel } from '@/components/agent-panel'
import { CalendarView } from '@/components/calendar-view'
import { Headline } from '@/components/headline'
import { scanConfigured } from '@/lib/agent'
import { formatDateTime, groupByStatus } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/** Deadlines on a six-week grid, with the same headline and agent controls as Today. */
export default async function CalendarPage() {
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 40 }),
  ])
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  const checked = lastScan ? formatDateTime(lastScan.at) : undefined
  const now = new Date()
  return (
    <div className="page-column">
      <Headline groups={groupByStatus(loops)} name={USER_NAME} now={now} />
      <AgentPanel configured={scanConfigured} checked={checked} />
      <CalendarView loops={loops} now={now} />
    </div>
  )
}
