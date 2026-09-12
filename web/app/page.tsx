import { AgentToolbar } from '@/components/agent-toolbar'
import { LoopCard } from '@/components/loop-card'
import { scanConfigured } from '@/lib/agent'
import { groupByStatus, STATUS_LABEL, STATUS_ORDER, summarize } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

const SECTION_HINT = {
  NEEDS_YOU: 'The next move is yours.',
  WAITING: 'You acted. Someone else owes the next move.',
  WATCHING: 'Nothing to do. The agent is monitoring for change.',
  RESOLVED: 'Closed by evidence or by you.',
  UNCERTAIN: 'The agent could not tell. Take a look.',
} as const

export default async function Home() {
  const store = await getStore()
  const loops = await store.listLoops(USER_ID)
  const groups = groupByStatus(loops)
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const anchors: Record<string, string> = {
    NEEDS_YOU: 'needs-you',
    WAITING: 'waiting',
    WATCHING: 'watching',
    RESOLVED: 'resolved',
    UNCERTAIN: 'uncertain',
  }

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {USER_NAME}
          </h1>
          <p className="mt-1 text-muted">{summarize(groups)}</p>
        </div>
        <AgentToolbar configured={scanConfigured} />
      </div>

      {loops.length === 0 && (
        <section className="rounded-lg border border-dashed border-border p-6 text-sm">
          <p className="font-medium">Nothing tracked yet.</p>
          <p className="mt-1 text-muted">
            Scan your inbox and the agent will sort what it finds into what needs you, what is
            waiting on someone else, and what it is watching for you.
          </p>
        </section>
      )}

      {STATUS_ORDER.map((status) => {
        const items = groups.get(status) ?? []
        if (items.length === 0 && (status !== 'NEEDS_YOU' || loops.length === 0)) return null
        const header = (
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {STATUS_LABEL[status]}
                {items.length > 0 && (
                  <span className="ml-2 font-normal tabular-nums">{items.length}</span>
                )}
              </h2>
              <p className="text-sm text-muted">{SECTION_HINT[status]}</p>
            </div>
          </div>
        )
        if (status === 'RESOLVED') {
          return (
            <details key={status} id={anchors[status]} className="scroll-mt-20 space-y-3">
              <summary className="cursor-pointer list-none">{header}</summary>
              <div className="space-y-3">
                {items.map((loop) => (
                  <LoopCard key={loop.id} loop={loop} now={now} />
                ))}
              </div>
            </details>
          )
        }
        return (
          <section key={status} id={anchors[status]} className="scroll-mt-20 space-y-3">
            {header}
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
                Nothing needs you right now.
              </p>
            ) : (
              items.map((loop) => <LoopCard key={loop.id} loop={loop} now={now} />)
            )}
          </section>
        )
      })}
    </div>
  )
}
