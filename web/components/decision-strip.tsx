import Link from 'next/link'
import type { Decision } from '@/lib/decisions'

const SHOWN = 3

/**
 * What waits on the user, above the list: the agent's proposals are the one thing on the page
 * only a person can move, so they come first (SPEC §8B). Up to three lines, then a count.
 */
export function DecisionStrip({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return null
  const rest = decisions.length - SHOWN
  return (
    <section className="decision-strip" aria-labelledby="strip-heading" data-tour="decisions-strip">
      <h2 id="strip-heading">
        Waiting on your decision <span>{decisions.length}</span>
      </h2>
      <ol>
        {decisions.slice(0, SHOWN).map(({ action, loop }) => (
          <li key={action.id}>
            <div>
              <p className="strip-summary">{action.summary}</p>
              {loop && <p className="strip-loop">{loop.title}</p>}
            </div>
            <Link href={`/decisions?action=${action.id}`} className="decision-review">
              Review
            </Link>
          </li>
        ))}
      </ol>
      {rest > 0 && (
        <Link href="/decisions" className="strip-more">
          and {rest} more
        </Link>
      )}
    </section>
  )
}
