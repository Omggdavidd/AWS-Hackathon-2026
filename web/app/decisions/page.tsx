import Link from 'next/link'
import { pendingDecisions } from '@/lib/decisions'
import { formatDue, formatMoney } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/**
 * Everything the agent will not do without you (ADR-0005): one line per proposal, opening the
 * loop where the action can be approved or declined. The review sheet arrives with #107.
 */
export default async function DecisionsPage() {
  const store = await getStore()
  const decisions = await pendingDecisions(store, USER_ID)
  const now = new Date()
  return (
    <div className="page-column decisions">
      <header className="page-head">
        <h1>Decisions</h1>
        <p>
          {decisions.length === 0
            ? 'Nothing waits on you. The agent handles the rest on its own.'
            : `${decisions.length} action${decisions.length === 1 ? '' : 's'} the agent will not take without you.`}
        </p>
      </header>
      {decisions.length > 0 && (
        <ol className="decision-list">
          {decisions.map(({ action, loop }) => {
            const amount = loop ? formatMoney(loop.amount) : undefined
            const due = loop ? formatDue(loop.dueAt, now) : undefined
            return (
              <li key={action.id} className="decision-row" data-risk={action.riskTier}>
                <div className="decision-main">
                  <p className="decision-summary">{action.summary}</p>
                  <p className="decision-meta">
                    {loop && <span>{loop.title}</span>}
                    {amount && <span>{amount}</span>}
                    {due && <span>{due}</span>}
                    <span>{action.riskTier} risk</span>
                  </p>
                </div>
                <Link href={loop ? `/loops/${loop.id}` : '/activity'} className="decision-review">
                  Review
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
