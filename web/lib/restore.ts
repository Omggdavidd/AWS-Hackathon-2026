import { randomUUID } from 'node:crypto'
import {
  applyTransition,
  type LedgerStore,
  type LoopStatus,
  StaleLoopWriteError,
} from '@openloop/shared'

/** The reason `resolveLoopByUser` writes on the actions it cancels; undo looks for it. */
const CANCELLED_BY_DONE = 'Cancelled: you marked this loop done'

/** As in `resolveLoopByUser`: enough attempts for a real race, few enough that it cannot spin. */
const MAX_ATTEMPTS = 3

/**
 * Undo for a swipe (SPEC §8B): put the loop back in the state it had before Done, Snooze or
 * Ignore, and, for Done, give the agent back the proposals that closing it cancelled. Only
 * proposals cancelled by that Done since `since` come back; anything the person declined on
 * purpose stays declined. Returns false when the loop is not where the move left it, so a stale
 * Undo after something else changed the loop does nothing.
 *
 * The loop write is a compare-and-swap (ADR-0014). Losing to a scan re-reads and re-checks that
 * the loop is still somewhere other than `previous` before undoing again, so an undo the scan has
 * already made meaningless returns false rather than being forced through.
 */
export async function restoreLoopByUser(
  store: LedgerStore,
  userId: string,
  loopId: string,
  previous: LoopStatus,
  since: string,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const loop = await store.getLoop(userId, loopId)
    if (!loop || loop.status === previous) return false
    const wasDone = loop.status === 'RESOLVED'

    const next = applyTransition(loop, previous, now)
    delete next.remindAt
    try {
      await store.putLoop(next, { ifUnchanged: true })
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
      reason: `You undid that; ${loop.status} -> ${previous}`,
    })

    if (!wasDone) return true
    const audit = await store.listAudit(userId, { loopId })
    const cancelledByDone = new Set(
      audit
        .filter(
          (e) => e.kind === 'action_cancelled' && e.reason === CANCELLED_BY_DONE && e.at >= since,
        )
        .map((e) => e.actionId),
    )
    const restoredAt = new Date(Date.parse(now) + 1).toISOString()
    for (const action of await store.listActions(userId, { loopId, status: 'CANCELLED' })) {
      if (!cancelledByDone.has(action.id)) continue
      await store.putAction({ ...action, status: 'PROPOSED' })
      await store.appendAudit({
        id: randomUUID(),
        userId,
        loopId,
        actionId: action.id,
        at: restoredAt,
        kind: 'action_proposed',
        actor: 'user',
        reason: 'Back on the table: you undid marking this loop done',
      })
    }
    return true
  }
  return false
}
