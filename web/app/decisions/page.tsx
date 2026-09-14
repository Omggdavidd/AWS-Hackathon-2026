import Link from 'next/link'
import { DecisionSheet } from '@/components/decision-sheet'
import { formatDue, formatMoney } from '@/lib/format'
import { loadDecisions, USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/**
 * Everything the agent will not do without you (ADR-0005, SPEC §8B): one line per proposal on the
 * left, and the chosen one on the right with everything being authorised in view. Same split as
 * Today; a sheet over the list on a phone.
 */
export default async function DecisionsPage({ searchParams }: PageProps<'/decisions'>) {
  const { action: raw } = await searchParams
  const selected = typeof raw === 'string' && raw ? raw : undefined
  const decisions = await loadDecisions(USER_ID)
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
        {n === 0 && (
          <div className="empty-state">
            <p className="empty-title">Nothing waits on you.</p>
            <p>
              When the agent wants to send, pay, book or sign something, it stops here first and
              shows you exactly what it would do.
            </p>
            <Link href="/" className="empty-link">
              Back to Today
            </Link>
          </div>
        )}
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
      {selected && (
        <aside className="pane" aria-label="Decision">
          <div className="pane-inner">
            <div className="pane-bar">
              <Link href="/decisions" className="pane-close" scroll={false}>
                ← Back to the list
              </Link>
            </div>
            <DecisionSheet actionId={selected} />
          </div>
        </aside>
      )}
    </div>
  )
}
