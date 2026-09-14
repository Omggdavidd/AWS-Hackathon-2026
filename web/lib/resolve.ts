import { randomUUID } from 'node:crypto'
import { applyTransition, type LedgerStore, StaleLoopWriteError } from '@openloop/shared'

/**
 * Attempts at the compare-and-swap before giving up. A user click races at most the scan or the
 * scheduled catch-up on one loop, so one retry is almost always enough; three bounds the work at
 * three reads and three writes and can never spin.
 */
const MAX_ATTEMPTS = 3

/**
 * "I already did this" (SPEC §8B): resolve the loop and cancel what it would have left behind.
 *
 * Without the cancellation the loop closes but its proposed actions stay PROPOSED, so a later
 * "Handle what you can" cancels them one by one — the agent appearing to work on a responsibility
 * the user already closed. APPROVED actions are left alone: the user asked for those, and one may
 * be executing on the runtime right now.
 *
 * The loop write is a compare-and-swap (ADR-0014), so a scan writing the same loop between the
 * read and the write cannot be overwritten. A lost race is re-read and the transition re-applied
 * to the fresh record, silently: the user sees a resolved loop either way, and the scan's changes
 * survive underneath. Nothing but the loop is written until that write wins, so a retry cannot
 * leave a second audit row behind.
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
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const loop = await store.getLoop(userId, loopId)
    if (!loop || loop.status === 'RESOLVED') return false

    try {
      await store.putLoop(applyTransition(loop, 'RESOLVED', now), { ifUnchanged: true })
    } catch (err) {
      if (err instanceof StaleLoopWriteError) continue
      throw err
    }

    await store.appendAudit({
      id: randomUUID(),
      userId,
      loopId,
      at: now,
      kind: 'state_changed',
      actor: 'user',
      reason: `You marked this as done; ${loop.status} -> RESOLVED`,
    })

    // A millisecond later than the state change: the DynamoDB audit sort key is `AUDIT#<at>#<id>`,
    // so events sharing a timestamp fall back to ordering by random uuid.
    const cancelledAt = new Date(Date.parse(now) + 1).toISOString()
    for (const action of await store.listActions(userId, { loopId, status: 'PROPOSED' })) {
      await store.putAction({ ...action, status: 'CANCELLED' })
      await store.appendAudit({
        id: randomUUID(),
        userId,
        loopId,
        actionId: action.id,
        at: cancelledAt,
        kind: 'action_cancelled',
        actor: 'user',
        reason: 'Cancelled: you marked this loop done',
      })
    }
    return true
  }
  return false
}
