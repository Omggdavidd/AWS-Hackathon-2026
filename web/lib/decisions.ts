import type { LedgerStore, OpenLoop, ProposedAction } from '@openloop/shared'

export type Decision = { action: ProposedAction; loop: OpenLoop | undefined }

/** An action the agent will not take on its own: proposed, and either gated or high risk (ADR-0005). */
export function needsDecision(action: ProposedAction): boolean {
  return action.status === 'PROPOSED' && (action.requiresApproval || action.riskTier === 'high')
}

/**
 * Everything waiting on the user, newest proposal first, each joined to its loop so a line can say
 * what it is about. Loops are passed in when the caller already has them, to avoid a second read.
 */
export async function pendingDecisions(
  store: LedgerStore,
  userId: string,
  loops?: OpenLoop[],
): Promise<Decision[]> {
  const actions = (await store.listActions(userId, { status: 'PROPOSED' })).filter(needsDecision)
  if (actions.length === 0) return []
  const all = loops ?? (await store.listLoops(userId))
  const byId = new Map(all.map((loop) => [loop.id, loop]))
  return actions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((action) => ({ action, loop: byId.get(action.loopId) }))
}
