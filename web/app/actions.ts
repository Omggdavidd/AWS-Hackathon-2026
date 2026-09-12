'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { invokeCommand, scanConfigured } from '@/lib/agent'
import { getStore, USER_ID } from '@/lib/ledger'
import { resolveLoopByUser } from '@/lib/resolve'

/** "I already did this": the user closes a loop by hand, cancelling what it leaves behind (SPEC §8B). */
export async function markDone(loopId: string): Promise<void> {
  const store = await getStore()
  if (!(await resolveLoopByUser(store, USER_ID, loopId))) return
  revalidatePath('/')
  revalidatePath(`/loops/${loopId}`)
  revalidatePath('/activity')
}

/**
 * Approval gate (ADR-0005): flips the record to APPROVED, then asks the deployed agent to execute it.
 * The agent re-checks the status in code before any effect runs. Without a runtime configured the
 * record is approved and left for a later `handle`.
 */
export async function approveAction(actionId: string): Promise<void> {
  const store = await getStore()
  const action = await store.getAction(USER_ID, actionId)
  if (action?.status !== 'PROPOSED') return
  const now = new Date().toISOString()
  await store.putAction({ ...action, status: 'APPROVED' })
  await store.appendAudit({
    id: randomUUID(),
    userId: USER_ID,
    loopId: action.loopId,
    actionId,
    at: now,
    kind: 'action_approved',
    actor: 'user',
    reason: `You approved: ${action.summary}`,
  })
  if (scanConfigured) {
    try {
      await invokeCommand(USER_ID, { command: 'execute', actionId })
    } catch (err) {
      await store.appendAudit({
        id: randomUUID(),
        userId: USER_ID,
        loopId: action.loopId,
        actionId,
        at: new Date().toISOString(),
        kind: 'action_failed',
        actor: 'system',
        reason:
          `Could not reach the agent: ${err instanceof Error ? err.message : String(err)}`.slice(
            0,
            500,
          ),
      })
    }
  }
  revalidatePath('/')
  revalidatePath(`/loops/${action.loopId}`)
  revalidatePath('/activity')
}

export async function cancelAction(actionId: string): Promise<void> {
  const store = await getStore()
  const action = await store.getAction(USER_ID, actionId)
  if (action?.status !== 'PROPOSED') return
  const now = new Date().toISOString()
  await store.putAction({ ...action, status: 'CANCELLED' })
  await store.appendAudit({
    id: randomUUID(),
    userId: USER_ID,
    loopId: action.loopId,
    actionId,
    at: now,
    kind: 'action_cancelled',
    actor: 'user',
    reason: `You declined: ${action.summary}`,
  })
  revalidatePath(`/loops/${action.loopId}`)
  revalidatePath('/activity')
}
