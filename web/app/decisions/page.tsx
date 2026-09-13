import Link from 'next/link'
import { DecisionSheet } from '@/components/decision-sheet'
import { pendingDecisions } from '@/lib/decisions'
import { formatDue, formatMoney } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/**
 * Everything the agent will not do without you (ADR-0005, SPEC §8B): one line per proposal on the
 * left, and the chosen one on the right with everything being authorised in view. Same split as
 * Today; a sheet over the list on a phone.
 */
export default async function DecisionsPage({ searchParams }: PageProps<'/decisions'>) {
  const { action: raw } = await searchParams
  const selected = typeof raw === 'string' && raw ? raw : undefined
  const store = await getStore()
  const decisions = await pendingDecisions(store, USER_ID)
  const now = new Date()
  const n = decisions.length
  return (
    <div className="today decisions" data-open={selected ? '' : undefined}>
      <section className="today-main" aria-label="Decisions">
        <header className="page-head">
          <h1>Decisions</h1>
          <p>
            {n === 0
              ? 'Nothing waits on you. The agent handles the rest on its own.'
              : `${n} action${n === 1 ? '' : 's'} the agent will not take without you.`}
          </p>
        </header>
        {n > 0 && (
          <ol className="decision-list">
            {decisions.map(({ action, loop }) => {
              const amount = loop ? formatMoney(loop.amount) : undefined
              const due = loop ? formatDue(loop.dueAt, now) : undefined
              return (
                <li
                  key={action.id}
                  className="decision-row"
                  data-risk={action.riskTier}
                  data-selected={action.id === selected || undefined}
                  aria-current={action.id === selected ? 'true' : undefined}
                >
                  <div className="decision-main">
                    <p className="decision-summary">{action.summary}</p>
                    <p className="decision-meta">
                      {loop && <span>{loop.title}</span>}
                      {amount && <span>{amount}</span>}
                      {due && <span>{due}</span>}
                      <span>{action.riskTier} risk</span>
                    </p>
                  </div>
                  <Link
                    href={`/decisions?action=${action.id}`}
                    className="decision-review"
                    scroll={false}
                  >
                    Review
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>
      <aside className="pane" aria-label={selected ? 'Decision' : 'Decisions'}>
        <div className="pane-inner">
          {selected ? (
            <>
              <div className="pane-bar">
                <Link href="/decisions" className="pane-close" scroll={false}>
                  ← Back to the list
                </Link>
              </div>
              <DecisionSheet actionId={selected} />
            </>
          ) : (
            <p className="pane-hint">
              {n === 0
                ? 'When the agent needs a yes or no, it will appear here.'
                : 'Choose a decision to see exactly what the agent would do, then approve or decline it.'}
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
