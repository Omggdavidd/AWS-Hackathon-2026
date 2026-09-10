import type { LoopStatus, OpenLoop } from '../schemas/index'

/**
 * Allowed status transitions (SPEC §7, state-lifecycle diagram). New evidence can change any
 * state, and resolution can close from any state, so the graph is permissive on purpose; the
 * value of this table is that every transition passes through one function with a reason.
 */
const ALLOWED: Record<LoopStatus, readonly LoopStatus[]> = {
  UNCERTAIN: ['NEEDS_YOU', 'WAITING', 'WATCHING', 'RESOLVED'],
  NEEDS_YOU: ['WAITING', 'WATCHING', 'RESOLVED', 'UNCERTAIN'],
  WAITING: ['NEEDS_YOU', 'WATCHING', 'RESOLVED', 'UNCERTAIN'],
  WATCHING: ['NEEDS_YOU', 'WAITING', 'RESOLVED', 'UNCERTAIN'],
  RESOLVED: ['NEEDS_YOU', 'WAITING', 'WATCHING'],
}

export function canTransition(from: LoopStatus, to: LoopStatus): boolean {
  return from !== to && ALLOWED[from].includes(to)
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: LoopStatus,
    readonly to: LoopStatus,
  ) {
    super(`Invalid transition ${from} -> ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

/** Returns a new loop with the status applied. Throws on a disallowed or no-op transition. */
export function applyTransition(loop: OpenLoop, to: LoopStatus, now: string): OpenLoop {
  if (!canTransition(loop.status, to)) throw new InvalidTransitionError(loop.status, to)
  const next: OpenLoop = { ...loop, status: to, updatedAt: now }
  if (to === 'RESOLVED') next.resolvedAt = now
  else delete next.resolvedAt
  return next
}
