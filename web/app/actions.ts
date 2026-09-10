'use server'

import { randomUUID } from 'node:crypto'
import { applyTransition } from '@openloop/shared'
import { revalidatePath } from 'next/cache'
import { getStore, USER_ID } from '@/lib/ledger'

/** "I already did this": the user closes a loop by hand (SPEC §8B). */
export async function markDone(loopId: string): Promise<void> {
  const store = await getStore()
  const loop = await store.getLoop(USER_ID, loopId)
  if (!loop || loop.status === 'RESOLVED') return
  const now = new Date().toISOString()
  await store.putLoop(applyTransition(loop, 'RESOLVED', now))
  await store.appendAudit({
    id: randomUUID(),
    userId: USER_ID,
    loopId,
    at: now,
    kind: 'state_changed',
    actor: 'user',
    reason: `You marked this as done; ${loop.status} -> RESOLVED`,
  })
  revalidatePath('/')
  revalidatePath(`/loops/${loopId}`)
}

/** Approval gate (ADR-0005): only flips the record; execution is the agent's job and checks APPROVED. */
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
