import type { AuditEvent, Evidence, SourceType } from '@openloop/shared'
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

/** Reasons longer than this fold behind their first sentence; the agent's full rationale stays one click away. */
const FOLD_AFTER = 200

/**
 * One responsibility, in the order a person checks it: what to do, what the agent found, what it
 * did, what happened. Every claim keeps its link back to the message or event it came from
 * (SPEC §8B, §12).
 */
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
  const resolved = loop.status === 'RESOLVED'
  const owesMove = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  // Overdue language only where the user owes the move, as on the overview rows.
  const due = resolved
    ? undefined
    : owesMove
      ? formatDue(loop.dueAt, now)
      : loop.dueAt
        ? formatDate(loop.dueAt, now)
        : undefined
  const soon =
    owesMove &&
    due !== undefined &&
    (due === 'Due today' || due === 'Due tomorrow' || due.startsWith('Overdue'))
  const facts: { label: string; value: string; soon?: boolean }[] = [
    ...(due ? [{ label: 'When', value: due, soon }] : []),
    ...(loop.amount ? [{ label: 'Amount', value: formatMoney(loop.amount) ?? '' }] : []),
    ...(loop.status === 'WAITING' && loop.waitingOn
      ? [{ label: 'Waiting on', value: loop.waitingOn }]
      : loop.requestedBy
        ? [{ label: 'From', value: loop.requestedBy }]
        : []),
    {
      label: 'Confidence',
      value: `${formatPercent(loop.confidence)} ${resolved ? 'done' : 'still open'}`,
    },
  ]
  const proposed = actions.filter((a) => a.status === 'PROPOSED')

  return (
    <article className="loop-page">
      <p className="loop-back">
        <Link href="/">← Overview</Link>
      </p>
      <header className="loop-header">
        <StatusChip status={loop.status} />
        <h1>{loop.title}</h1>
        <dl className="loop-facts">
          {facts.map((fact) => (
            <div key={fact.label} data-soon={fact.soon || undefined}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="loop-section loop-next" aria-labelledby="next-heading">
        <h2 id="next-heading">{resolved ? 'Closed' : 'What to do'}</h2>
        {resolved ? (
          <p className="next-action">
            {loop.resolvedAt
              ? `Closed ${formatDate(loop.resolvedAt, now)}. Nothing left to do.`
              : 'Nothing left to do.'}
          </p>
        ) : (
          <>
            <p className="next-action">{loop.nextAction ?? 'No next step recorded yet.'}</p>
            {loop.consequence && (
              <p className="consequence">
                <span className="consequence-label">If ignored</span>
                {loop.consequence}
              </p>
            )}
            {proposed.length > 0 && (
              <p className="pending-note">
                {proposed.length === 1
                  ? 'The agent has one action waiting for you below.'
                  : `The agent has ${proposed.length} actions waiting for you below.`}
              </p>
            )}
            <div className="loop-buttons">
              <form action={markDone.bind(null, loop.id)}>
                <SubmitButton pendingLabel="Saving…">I already did this</SubmitButton>
              </form>
            </div>
          </>
        )}
      </section>

      <section className="loop-section" aria-labelledby="found-heading">
        <h2 id="found-heading">What I found</h2>
        {evidence.length === 0 ? (
          <p className="loop-empty">No evidence recorded.</p>
        ) : (
          <ol className="evidence-list">
            {evidence.map((item) => (
              <EvidenceItem key={item.id} item={item} loopId={loop.id} now={now} />
            ))}
          </ol>
        )}
        <p className="source-list">
          <span>Source{loop.sourceRefs.length === 1 ? '' : 's'}</span>
          {loop.sourceRefs.map((ref) => (
            <Source
              key={ref.sourceId}
              loopId={loop.id}
              sourceType={ref.sourceType}
              sourceId={ref.sourceId}
            />
          ))}
        </p>
      </section>

      {actions.length > 0 && (
        <section className="loop-section" aria-labelledby="actions-heading">
          <h2 id="actions-heading">What the agent did</h2>
          <ul className="action-list">
            {actions.map((action) => {
              const effect = parseEffect(action)
              const reason = terminalReason(action, audit)
              const pending = action.status === 'PROPOSED'
              return (
                <li key={action.id} className="action-item" data-status={action.status}>
                  <div className="action-head">
                    <div>
                      <p className="action-summary">{action.summary}</p>
                      <p className="action-state">
                        <span data-status={action.status}>{STATUS_TEXT[action.status]}</span>
                        <span>{action.riskTier} risk</span>
                        {pending && action.requiresApproval && <span>needs your approval</span>}
                      </p>
                    </div>
                    {pending && (
                      <div className="action-buttons">
                        <form action={approveAction.bind(null, action.id)}>
                          <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
                        </form>
                        <form action={cancelAction.bind(null, action.id)}>
                          <SubmitButton pendingLabel="Declining…" subtle>
                            Decline
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                  {effect && <ActionEffect effect={effect} />}
                  {reason && <p className="action-reason">{reason}</p>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="loop-section" aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        <ol className="history-list">
          {[...audit].reverse().map((event) => (
            <HistoryItem key={event.id} event={event} now={now} />
          ))}
        </ol>
      </section>
    </article>
  )
}

function EvidenceItem({ item, loopId, now }: { item: Evidence; loopId: string; now: Date }) {
  const kind = item.sourceType === 'agent' ? 'Agent action' : SUPPORTS_LABEL[item.supports]
  return (
    <li
      className="evidence-item"
      data-supports={item.sourceType === 'agent' ? 'AGENT' : item.supports}
    >
      <blockquote>{item.excerpt}</blockquote>
      <p className="evidence-meta">
        <span className="evidence-kind">{kind}</span>
        <time dateTime={item.observedAt}>{formatDate(item.observedAt, now)}</time>
        <Source loopId={loopId} sourceType={item.sourceType} sourceId={item.sourceId} />
        <span>{formatPercent(item.confidence)} sure</span>
      </p>
    </li>
  )
}

function HistoryItem({ event, now }: { event: AuditEvent; now: Date }) {
  const long = event.reason.length > FOLD_AFTER
  const lead = long ? firstSentence(event.reason) : event.reason
  return (
    <li className="history-item">
      <time dateTime={event.at}>{formatDate(event.at, now)}</time>
      <div>
        {long ? (
          <details className="history-fold">
            <summary>
              {lead} <span className="fold-more">more</span>
            </summary>
            <p>{event.reason}</p>
          </details>
        ) : (
          <p>{lead}</p>
        )}
        <span className="history-actor">{ACTOR_LABEL[event.actor]}</span>
      </div>
    </li>
  )
}

const ACTOR_LABEL: Record<AuditEvent['actor'], string> = {
  agent: 'agent',
  user: 'you',
  system: 'system',
}

/** The first sentence, or the first 200 characters at a word boundary when the sentence runs long. */
function firstSentence(text: string): string {
  const match = text.match(/^.{20,}?[.!?](?=\s|$)/)
  const lead = match?.[0] ?? text
  if (lead.length <= FOLD_AFTER) return lead
  const cut = lead.slice(0, FOLD_AFTER)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : FOLD_AFTER)}…`
}

/**
 * A link to the message or event a claim came from. Evidence the agent wrote during execution has
 * no page behind it and no useful id to show, so it names the source type and stops there.
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
  if (!hasSourcePage(sourceType)) return null
  return (
    <Link href={messageHref(sourceId, loopId)} className="source-link">
      {SOURCE_LABEL[sourceType]} <code>{sourceId}</code>
    </Link>
  )
}
