import Link from 'next/link'
import { ActionEffect } from '@/components/action-effect'
import { DecisionButtons } from '@/components/decision-buttons'
import { describeProposal, needsDecision } from '@/lib/decisions'
import { parseEffect, STATUS_TEXT, terminalReason } from '@/lib/effects'
import { formatDate, formatDue, formatMoney } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'
import { hasSourcePage, messageHref } from '@/lib/source'

/**
 * One decision, with everything a person is authorising in front of them (SPEC §8B): the action
 * as the artefact it would be, the loop it serves, the evidence it rests on, then Approve or
 * Decline. After the choice the same sheet shows what happened.
 */
export async function DecisionSheet({ actionId }: { actionId: string }) {
  const store = await getStore()
  const action = await store.getAction(USER_ID, actionId)
  if (!action) return <p className="pane-missing">That action is no longer in the ledger.</p>
  const [loop, evidence, audit] = await Promise.all([
    store.getLoop(USER_ID, action.loopId),
    store.listEvidence(action.loopId),
    store.listAudit(USER_ID, { loopId: action.loopId }),
  ])
  const now = new Date()
  const proposal = describeProposal(action)
  const effect = parseEffect(action)
  const reason = terminalReason(action, audit)
  const open = needsDecision(action)
  const quote = evidence.find((e) => e.supports === 'OPEN') ?? evidence[0]
  const due = loop ? formatDue(loop.dueAt, now) : undefined

  return (
    <article className="decision-sheet" data-status={action.status}>
      <header className="decision-head">
        <p className="decision-kicker">
          {open ? 'Needs your decision' : STATUS_TEXT[action.status]}
          <span className="decision-risk">{action.riskTier} risk</span>
        </p>
        <h1>{action.summary}</h1>
        {loop && (
          <p className="decision-for">
            For{' '}
            <Link href={`/loops/${loop.id}`} className="decision-for-link">
              {loop.title}
            </Link>
            {due ? `, ${due.charAt(0).toLowerCase()}${due.slice(1)}` : ''}
            {loop.consequence ? `. If ignored: ${loop.consequence}` : ''}
          </p>
        )}
      </header>

      <section className="decision-body" aria-label="What the agent would do">
        {effect ? (
          <ActionEffect effect={effect} />
        ) : proposal?.kind === 'email' ? (
          <div className="effect">
            <p className="effect-kind">
              {action.type === 'send_email' ? 'Email it would send' : 'Draft it would prepare'}
            </p>
            <dl className="effect-fields">
              <dt>To</dt>
              <dd>{proposal.to}</dd>
              <dt>Subject</dt>
              <dd>{proposal.subject}</dd>
            </dl>
            <p className="effect-body">{proposal.body}</p>
          </div>
        ) : proposal?.kind === 'payment' ? (
          <div className="effect">
            <p className="effect-kind">Payment it would make</p>
            <p className="effect-amount">{proposal.amount ?? formatMoney(loop?.amount) ?? ''}</p>
            {proposal.portal && <p className="effect-detail">Through {proposal.portal}</p>}
          </div>
        ) : proposal?.kind === 'choice' ? (
          <div className="effect">
            <p className="effect-kind">It would pick one of these</p>
            <ul className="effect-options">
              {proposal.options.map((option) => (
                <li key={option} data-free={proposal.free.includes(option) || undefined}>
                  {option}
                  {proposal.free.includes(option) && <span>free on your calendar</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : proposal?.kind === 'fields' ? (
          <div className="effect">
            <p className="effect-kind">Details</p>
            <dl className="effect-fields">
              {proposal.fields.map((f) => (
                <div key={f.label} className="effect-field">
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="loop-empty">The agent recorded no detail beyond the summary.</p>
        )}
        {reason && <p className="action-reason">{reason}</p>}
      </section>

      {quote && (
        <section className="decision-evidence" aria-label="Why">
          <h2>Because</h2>
          <blockquote className="decision-quote">{quote.excerpt}</blockquote>
          <p className="evidence-meta">
            <time dateTime={quote.observedAt}>{formatDate(quote.observedAt, now)}</time>
            {hasSourcePage(quote.sourceType) && (
              <Link href={messageHref(quote.sourceId, action.loopId)} className="source-link">
                Read the original
              </Link>
            )}
          </p>
        </section>
      )}

      {open ? (
        <DecisionButtons actionId={action.id} />
      ) : (
        <p className="decision-done">
          {action.status === 'APPROVED'
            ? 'Approved. The agent is carrying it out.'
            : action.status === 'EXECUTED'
              ? `Done${action.executedAt ? ` ${formatDate(action.executedAt, now)}` : ''}.`
              : action.status === 'CANCELLED'
                ? 'Declined. The agent will not do this.'
                : 'This action did not complete.'}
        </p>
      )}
    </article>
  )
}
