import Link from 'next/link'
import { getStore, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/** Quiet audit feed of what happened in the background (SPEC §8F). */
export default async function ActivityPage() {
  const store = await getStore()
  const events = await store.listAudit(USER_ID, { limit: 50 })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-muted">Everything the agent did, and why.</p>
      </div>
      <ol className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-4 text-muted">
              <span>
                {e.kind.replace(/_/g, ' ')} · {e.actor}
              </span>
              <time dateTime={e.at}>
                {new Date(e.at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <p className="mt-1">
              {e.loopId ? (
                <Link href={`/loops/${e.loopId}`} className="underline-offset-2 hover:underline">
                  {e.reason}
                </Link>
              ) : (
                e.reason
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}
