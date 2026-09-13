import { ChangeBanner } from '@/components/change-banner'
import { LoopRing } from '@/components/loop-mark'
import type { ChangeSummary } from '@/lib/changes'

/**
 * The pane before a loop is chosen: the share closed and what changed since the last look.
 * Nothing here repeats the list; it is the part of the day that is not a row.
 */
export function PaneRest({
  closed,
  total,
  changed,
}: {
  closed: number
  total: number
  changed?: ChangeSummary
}) {
  return (
    <div className="pane-rest" data-ring="bare">
      <LoopRing closed={closed} total={total} />
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
