'use client'

import { useSyncExternalStore, useTransition } from 'react'
import { undoMove } from '@/app/actions'
import { type Move, readUndo, subscribeUndo, takeUndo } from '@/lib/undo-store'

const WORD: Record<Move, string> = { done: 'Marked done', snooze: 'Snoozed until tomorrow' }

/** One toast for whichever move happened last, with Undo, mounted once beside the list. */
export function UndoToast() {
  const pending = useSyncExternalStore(subscribeUndo, readUndo, () => undefined)
  const [busy, start] = useTransition()
  if (!pending) return null
  return (
    <div className="undo-toast" role="status">
      <span>{WORD[pending.move]}.</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const p = takeUndo()
          if (p) start(() => undoMove(p.loopId, p.previous, p.since))
        }}
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  )
}
