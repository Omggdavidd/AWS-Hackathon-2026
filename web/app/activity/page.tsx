import Link from 'next/link'
import { KindBadge } from '@/components/status-chip'
import { getStore, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/** Quiet audit feed of what happened in the background (SPEC §8F), grouped by day. */
export default async function ActivityPage() {
  const store = await getStore()
  const events = (await store.listAudit(USER_ID, { limit: 80 })).filter(
    (e) => e.kind !== 'evidence_added',
  )
  const days = new Map<string, typeof events>()
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
    days.set(day, [...(days.get(day) ?? []), e])
  }
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-muted">Everything the agent did, and why.</p>
      </div>
      {events.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          Nothing has happened yet. Run a scan from the home screen.
        </p>
      )}
      {[...days].map(([day, items]) => (
        <section key={day} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{day}</h2>
          <ol className="divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((e) => (
              <li key={e.id} className="flex gap-3 p-3 text-sm">
                <time
                  dateTime={e.at}
                  className="w-16 shrink-0 pt-0.5 text-xs text-muted tabular-nums"
                >
                  {new Date(e.at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <KindBadge kind={e.kind} />
                    <span className="text-xs text-muted">{e.actor}</span>
                  </div>
                  {e.loopId ? (
                    <Link
                      href={`/loops/${e.loopId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {e.reason}
                    </Link>
                  ) : (
                    <span>{e.reason}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
