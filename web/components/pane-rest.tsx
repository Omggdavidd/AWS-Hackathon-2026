import Link from 'next/link'
import { ChangeBanner } from '@/components/change-banner'
import { LoopRing } from '@/components/loop-mark'
import type { ChangeSummary } from '@/lib/changes'
import type { Decision } from '@/lib/decisions'

/**
 * The pane before a loop is chosen: the share closed, what changed since the last look, and what
 * waits on a decision. Nothing here repeats the list; it is the part of the day that is not a row.
 */
export function PaneRest({
  closed,
  total,
  changed,
  decisions,
}: {
  closed: number
  total: number
  changed?: ChangeSummary
  decisions: Decision[]
}) {
  const n = decisions.length
  return (
    <div className="pane-rest" data-ring="bare">
      <LoopRing closed={closed} total={total} />
      {n > 0 && (
        <section className="pane-card" aria-labelledby="pane-decisions">
          <h2 id="pane-decisions">Waiting on your decision</h2>
          <ul className="pane-decisions">
            {decisions.slice(0, 3).map(({ action, loop }) => (
              <li key={action.id}>
                <Link href={loop ? `/loops/${loop.id}` : '/decisions'} className="pane-decision">
                  {action.summary}
                </Link>
                {loop && <span className="pane-decision-loop">{loop.title}</span>}
              </li>
            ))}
          </ul>
          <Link href="/decisions" className="pane-link">
            {n === 1 ? 'Review it' : n <= 3 ? 'Review them' : `Review all ${n}`}
          </Link>
        </section>
      )}
      {changed && (
        <section className="pane-card" aria-labelledby="pane-changed">
          <h2 id="pane-changed">Since you last looked</h2>
          <ChangeBanner sentences={changed.sentences} latestAt={changed.latestAt} />
        </section>
      )}
      <p className="pane-hint">
        Choose a loop to read it here. Arrow keys move, <kbd>Enter</kbd> opens.
      </p>
    </div>
  )
}
