import type { SourceType } from '@openloop/shared'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { approveAction, cancelAction, markDone } from '@/app/actions'
import { ActionEffect } from '@/components/action-effect'
import { StatusChip } from '@/components/status-chip'
import { SubmitButton } from '@/components/submit-button'
import { parseEffect, STATUS_TEXT, terminalReason } from '@/lib/effects'
import { formatDate, formatDue, formatMoney, formatPercent } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'
import { hasSourcePage, messageHref, SOURCE_LABEL } from '@/lib/source'

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
            {SOURCE_LABEL[ref.sourceType]}{' '}
            <Source loopId={loop.id} sourceType={ref.sourceType} sourceId={ref.sourceId} />
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
                  <span>
                    {e.sourceType === 'agent' ? 'Agent action' : SUPPORTS_LABEL[e.supports]}
                  </span>
                  <span>·</span>
                  <span>{formatPercent(e.confidence)}</span>
                  <span>·</span>
                  <Source loopId={loop.id} sourceType={e.sourceType} sourceId={e.sourceId} />
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
        <Section title="Actions">
          <ul className="space-y-3">
            {actions.map((a) => {
              const effect = parseEffect(a)
              const reason = terminalReason(a, audit)
              return (
                <li key={a.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p>{a.summary}</p>
                      <p className="text-muted">
                        {STATUS_TEXT[a.status]} · {a.riskTier} risk
                        {a.requiresApproval && a.status === 'PROPOSED'
                          ? ' · needs your approval'
                          : ''}
                      </p>
                    </div>
                    {a.status === 'PROPOSED' && (
                      <div className="flex shrink-0 gap-2">
                        <form action={approveAction.bind(null, a.id)}>
                          <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
                        </form>
                        <form action={cancelAction.bind(null, a.id)}>
                          <SubmitButton pendingLabel="Declining…" subtle>
                            Decline
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                  {effect && <ActionEffect effect={effect} />}
                  {reason && <p className="mt-1 text-muted">{reason}</p>}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {loop.status !== 'RESOLVED' && (
        <form action={markDone.bind(null, loop.id)}>
          <SubmitButton pendingLabel="Saving…">I already did this</SubmitButton>
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

/**
 * Every claim points at the message or event it came from (SPEC §12). Evidence the agent wrote
 * during execution has no page behind it, so its id stays plain text rather than a dead link.
 */
function Source({
  loopId,
  sourceType,
  sourceId,
}: {
  loopId: string
  sourceType: SourceType
  sourceId: string
}) {
  if (!hasSourcePage(sourceType)) return <span className="font-mono">{sourceId}</span>
  return (
    <Link
      href={messageHref(sourceId, loopId)}
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
