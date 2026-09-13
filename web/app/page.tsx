import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AgentPanel } from '@/components/agent-panel'
import { ChangeBanner } from '@/components/change-banner'
import { DecisionStrip } from '@/components/decision-strip'
import { Headline } from '@/components/headline'
import { LoopDetail } from '@/components/loop-detail'
import { LoopRing } from '@/components/loop-mark'
import { TodayList } from '@/components/today-list'
import { Tour } from '@/components/tour'
import { Welcome } from '@/components/welcome'
import { scanConfigured } from '@/lib/agent'
import { AGENT_COOKIE, cleanAgentName, TOUR_COOKIE } from '@/lib/agent-name'
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
  const { view, loop: rawLoop, tour: rawTour } = await searchParams
  // The views used to be query strings on this page; every old link still lands somewhere.
  if (view === 'board') redirect('/board')
  if (view === 'calendar') redirect('/calendar')
  const selected = typeof rawLoop === 'string' && rawLoop ? rawLoop : undefined
  const jar = await cookies()
  const agentName = cleanAgentName(jar.get(AGENT_COOKIE)?.value)
  // First visit: nothing is named yet, so the product introduces itself before showing a list.
  if (!agentName) return <Welcome />
  const tour = rawTour === '1' || !jar.get(TOUR_COOKIE)

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
  const seen = jar.get('openloops-seen')?.value
  const banner = changed && (!seen || changed.latestAt > seen) ? changed : undefined

  return (
    <div className="today" data-open={selected ? '' : undefined}>
      {tour && <Tour />}
      <section className="today-main" aria-label="Today">
        {banner && <ChangeBanner sentences={banner.sentences} latestAt={banner.latestAt} />}
        <Headline
          groups={groups}
          name={USER_NAME}
          now={now}
          aside={<LoopRing closed={resolved} total={loops.length} />}
        />
        <AgentPanel configured={scanConfigured} checked={checked} name={agentName} />
        <DecisionStrip decisions={decisions} />
        <p className="view-hint">
          Arrow keys move, <kbd>Enter</kbd> opens.
        </p>
        <TodayList loops={loops} now={now} selected={selected} />
      </section>
      {selected && (
        <aside className="pane" aria-label="Selected loop">
          <div className="pane-inner">
            <div className="pane-bar">
              <Link href="/" className="pane-close" scroll={false}>
                ← Back to the list
              </Link>
              <Link href={`/loops/${selected}`} className="pane-open">
                Open as a page
              </Link>
            </div>
            <LoopDetail id={selected} mode="pane" />
          </div>
        </aside>
      )}
    </div>
  )
}
