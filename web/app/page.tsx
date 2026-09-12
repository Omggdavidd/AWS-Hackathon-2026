import { CatchUpButton } from '@/components/catch-up-button'
import { HandleButton } from '@/components/handle-button'
import { LoopCard } from '@/components/loop-card'
import { ScanButton } from '@/components/scan-button'
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

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {USER_NAME}
          </h1>
          <p className="mt-1 text-muted">{summarize(groups)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ScanButton configured={scanConfigured} />
          <ScanButton configured={scanConfigured} variant="delta" label="Check for new mail" />
          <HandleButton configured={scanConfigured} />
          <CatchUpButton configured={scanConfigured} />
        </div>
      </div>
      {STATUS_ORDER.map((status) => {
        const items = groups.get(status) ?? []
        if (items.length === 0 && status !== 'NEEDS_YOU') return null
        return (
          <section key={status} className="space-y-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {STATUS_LABEL[status]}
              </h2>
              <p className="text-sm text-muted">{SECTION_HINT[status]}</p>
            </div>
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
