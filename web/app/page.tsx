import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AgentPanel } from '@/components/agent-panel'
import { DecisionStrip } from '@/components/decision-strip'
import { Headline } from '@/components/headline'
import { LoopDetail } from '@/components/loop-detail'
import { PaneRest } from '@/components/pane-rest'
import { TodayList } from '@/components/today-list'
import { scanConfigured } from '@/lib/agent'
import { summarizeChanges } from '@/lib/changes'
import { pendingDecisions } from '@/lib/decisions'
import { formatDateTime, groupByStatus } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/**
 * Today: the list grouped by time on the left and, on a wide screen, the chosen loop on the right
 * so nothing is more than a glance away (the split view Superhuman and Linear settled on). On a
 * narrow screen the same URL opens the loop as a sheet over the list.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { view, loop: rawLoop } = await searchParams
  // The views used to be query strings on this page; every old link still lands somewhere.
  if (view === 'board') redirect('/board')
  if (view === 'calendar') redirect('/calendar')
  const selected = typeof rawLoop === 'string' && rawLoop ? rawLoop : undefined

  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 40 }),
  ])
  const decisions = await pendingDecisions(store, USER_ID, loops)
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  const checked = lastScan ? formatDateTime(lastScan.at) : undefined
  const now = new Date()
  const groups = groupByStatus(loops)
  const resolved = groups.get('RESOLVED')?.length ?? 0
  // Rendered only when something newer than the last dismissal happened, so there is no flash.
  const changed = summarizeChanges(audit, loops, now)
  const seen = (await cookies()).get('openloops-seen')?.value
  const banner = changed && (!seen || changed.latestAt > seen) ? changed : undefined

  return (
    <div className="today" data-open={selected ? '' : undefined}>
      <section className="today-main" aria-label="Today">
        <Headline groups={groups} name={USER_NAME} now={now} />
        <AgentPanel configured={scanConfigured} checked={checked} />
        <DecisionStrip decisions={decisions} />
        <p className="view-hint">
          Arrow keys move, <kbd>Enter</kbd> opens.
        </p>
        <TodayList loops={loops} now={now} selected={selected} />
      </section>
      <aside className="pane" aria-label={selected ? 'Selected loop' : 'Your day'}>
        <div className="pane-inner">
          {selected ? (
            <>
              <div className="pane-bar">
                <Link href="/" className="pane-close" scroll={false}>
                  ← Back to the list
                </Link>
                <Link href={`/loops/${selected}`} className="pane-open">
                  Open as a page
                </Link>
              </div>
              <LoopDetail id={selected} mode="pane" />
            </>
          ) : (
            <PaneRest closed={resolved} total={loops.length} changed={banner} />
          )}
        </div>
      </aside>
    </div>
  )
}
