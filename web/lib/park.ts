import { randomUUID } from 'node:crypto'
import { applyTransition, type LedgerStore, StaleLoopWriteError } from '@openloop/shared'

const DAY_MS = 86_400_000

/** As in `resolveLoopByUser`: enough attempts for a real race, few enough that it cannot spin. */
const MAX_ATTEMPTS = 3

/** The two ways a user parks a loop without claiming it is done (SPEC §8B). */
export type ParkKind = 'remind' | 'ignore'

/**
 * "Remind me tomorrow" and "Ignore": both move the loop to Watching, so it stops competing for
 * attention on the overview and stops being counted in "N things need you". They differ only in
 * whether a reminder survives.
 *
 * Proposed actions are left alone, unlike `resolveLoopByUser`: parking says "not now", not "done",
 * and the agent's suggestion is still the right one when the loop comes back.
 *
 * A loop already in Watching is re-parked without a transition — `applyTransition` throws on a
 * no-op — so pressing Remind twice extends the reminder instead of erroring.
 *
 * "Tomorrow" is 24 hours out. Nothing consumes `remindAt` yet, since there is no scheduler; it
 * records the intent, the loop page shows it, and a later job can pick it up.
 *
 * The write is a compare-and-swap (ADR-0015); losing to a scan re-reads and parks the fresh
 * record instead, which keeps whatever the scan changed and still ends in Watching.
 *
 * Takes the store rather than reaching for it, so the rule is unit-testable without Next.
 * Returns false when there was nothing to do, so the caller can skip revalidation.
 */
export async function parkLoopByUser(
  store: LedgerStore,
  userId: string,
  loopId: string,
  kind: ParkKind,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const loop = await store.getLoop(userId, loopId)
    if (!loop || loop.status === 'RESOLVED') return false

    const alreadyWatching = loop.status === 'WATCHING'
    const moved = alreadyWatching
      ? { ...loop, updatedAt: now }
      : applyTransition(loop, 'WATCHING', now)
    const move = alreadyWatching ? '' : `; ${loop.status} -> WATCHING`

    const next = { ...moved }
    if (kind === 'ignore') delete next.remindAt
    else next.remindAt = new Date(Date.parse(now) + DAY_MS).toISOString()

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
      reason:
        kind === 'ignore' ? `You ignored this${move}` : `You asked to be reminded tomorrow${move}`,
    })
    return true
  }
  return false
}
