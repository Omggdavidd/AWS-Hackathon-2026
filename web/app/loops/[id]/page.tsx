import Link from 'next/link'
import { notFound } from 'next/navigation'
import { approveAction, cancelAction, markDone } from '@/app/actions'
import { StatusChip } from '@/components/status-chip'
import { formatDate, formatDue, formatMoney, formatPercent } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

const SUPPORTS_LABEL = {
  OPEN: 'Opened this',
  RESOLVED: 'Resolves this',
  UPDATED: 'Updated this',
  CONTRADICTS: 'Contradicts this',
} as const

export default async function LoopPage({ params }: PageProps<'/loops/[id]'>) {
  const { id } = await params
  const store = await getStore()
  const loop = await store.getLoop(USER_ID, id)
  if (!loop) notFound()
  const [evidence, actions, audit] = await Promise.all([
    store.listEvidence(id),
    store.listActions(USER_ID, { loopId: id }),
    store.listAudit(USER_ID, { loopId: id }),
  ])
  const now = new Date()
  const facts = [formatMoney(loop.amount), formatDue(loop.dueAt, now), loop.requestedBy].filter(
    Boolean,
  )

  return (
    <article className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Home
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{loop.title}</h1>
          <StatusChip status={loop.status} />
        </div>
        {facts.length > 0 && <p className="mt-1 text-muted">{facts.join(' · ')}</p>}
      </div>

      <Section title="Why this exists">
        {loop.sourceRefs.map((ref) => (
          <p key={ref.sourceId} className="text-sm">
            {ref.sourceType === 'email' ? 'Email' : 'Calendar event'}{' '}
            <SourceLink loopId={loop.id} sourceId={ref.sourceId} />
          </p>
        ))}
      </Section>

      <Section title="What I found">
        {evidence.length === 0 ? (
          <p className="text-sm text-muted">No evidence recorded.</p>
        ) : (
          <ul className="space-y-3">
            {evidence.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex items-center gap-2 text-muted">
                  <span>{formatDate(e.observedAt)}</span>
                  <span>·</span>
                  <span>{SUPPORTS_LABEL[e.supports]}</span>
                  <span>·</span>
                  <span>{formatPercent(e.confidence)}</span>
                  <span>·</span>
                  <SourceLink loopId={loop.id} sourceId={e.sourceId} />
                </div>
                <blockquote className="mt-1 border-l-2 border-border pl-3">{e.excerpt}</blockquote>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Confidence</dt>
          <dd>
            {formatPercent(loop.confidence)}{' '}
            {loop.status === 'RESOLVED' ? 'this is done' : 'this is still outstanding'}
          </dd>
          {loop.consequence && (
            <>
              <dt className="text-muted">If ignored</dt>
              <dd>{loop.consequence}</dd>
            </>
          )}
          {loop.nextAction && (
            <>
              <dt className="text-muted">Next</dt>
              <dd>{loop.nextAction}</dd>
            </>
          )}
        </dl>
      </Section>

      {actions.length > 0 && (
        <Section title="Proposed actions">
          <ul className="space-y-3">
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <div>
                  <p>{a.summary}</p>
                  <p className="text-muted">
                    {a.riskTier} risk · {a.status.toLowerCase()}
                    {a.requiresApproval && a.status === 'PROPOSED' ? ' · needs your approval' : ''}
                  </p>
                </div>
                {a.status === 'PROPOSED' && (
                  <div className="flex shrink-0 gap-2">
                    <form action={approveAction.bind(null, a.id)}>
                      <Button>Approve</Button>
                    </form>
                    <form action={cancelAction.bind(null, a.id)}>
                      <Button subtle>Decline</Button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {loop.status !== 'RESOLVED' && (
        <form action={markDone.bind(null, loop.id)}>
          <Button>I already did this</Button>
        </form>
      )}

      <Section title="Timeline">
        <ol className="space-y-2 text-sm">
          {[...audit].reverse().map((e) => (
            <li key={e.id} className="grid grid-cols-[4rem_1fr] gap-3">
              <span className="text-muted">{formatDate(e.at)}</span>
              <span>
                {e.reason}
                <span className="text-muted"> · {e.actor}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </article>
  )
}

/** Every claim links back to the message or event it came from (SPEC §12). */
function SourceLink({ loopId, sourceId }: { loopId: string; sourceId: string }) {
  return (
    <Link
      href={`/messages/${sourceId}?loop=${loopId}`}
      className="font-mono underline decoration-border underline-offset-2 hover:text-foreground"
    >
      {sourceId}
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Button({ children, subtle = false }: { children: React.ReactNode; subtle?: boolean }) {
  const style = subtle
    ? 'border border-border bg-card hover:bg-background'
    : 'bg-foreground text-background hover:opacity-90'
  return (
    <button
      type="submit"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${style}`}
    >
      {children}
    </button>
  )
}
