import { randomUUID } from 'node:crypto'
import { applyTransition, type LedgerStore } from '@openloop/shared'

/**
 * "I already did this" (SPEC §8B): resolve the loop and cancel what it would have left behind.
 *
 * Without the cancellation the loop closes but its proposed actions stay PROPOSED, so a later
 * "Handle what you can" cancels them one by one — the agent appearing to work on a responsibility
 * the user already closed. APPROVED actions are left alone: the user asked for those, and one may
 * be executing on the runtime right now.
 *
 * Takes the store rather than reaching for it, so the rule is unit-testable without Next.
 * Returns false when there was nothing to do, so the caller can skip revalidation.
 */
export async function resolveLoopByUser(
  store: LedgerStore,
  userId: string,
  loopId: string,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const loop = await store.getLoop(userId, loopId)
  if (!loop || loop.status === 'RESOLVED') return false

  await store.putLoop(applyTransition(loop, 'RESOLVED', now))
  await store.appendAudit({
    id: randomUUID(),
    userId,
    loopId,
    at: now,
    kind: 'state_changed',
    actor: 'user',
    reason: `You marked this as done; ${loop.status} -> RESOLVED`,
  })

  for (const action of await store.listActions(userId, { loopId, status: 'PROPOSED' })) {
    await store.putAction({ ...action, status: 'CANCELLED' })
    await store.appendAudit({
      id: randomUUID(),
      userId,
      loopId,
      actionId: action.id,
      at: now,
      kind: 'action_cancelled',
      actor: 'user',
      reason: 'Cancelled: you marked this loop done',
    })
  }
  return true
}
