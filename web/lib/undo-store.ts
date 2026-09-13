import type { LoopStatus } from '@openloop/shared'

export type Move = 'done' | 'snooze'
export type Pending = { loopId: string; previous: LoopStatus; move: Move; since: string }

/** How long Undo stays on screen. */
export const UNDO_MS = 8000

let current: Pending | undefined
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/**
 * The one pending undo, kept outside any row: a swiped row leaves the list the moment the server
 * confirms the move, so a toast held in the row's own state would vanish with it.
 */
export function announceUndo(next: Pending) {
  clearTimeout(timer)
  current = next
  timer = setTimeout(() => {
    current = undefined
    emit()
  }, UNDO_MS)
  emit()
}

export function takeUndo(): Pending | undefined {
  clearTimeout(timer)
  const p = current
  current = undefined
  emit()
  return p
}

export function subscribeUndo(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function readUndo(): Pending | undefined {
  return current
}
