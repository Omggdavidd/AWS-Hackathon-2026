'use server'

import { randomUUID } from 'node:crypto'
import type { LoopStatus } from '@openloop/shared'
import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { invokeCommand, scanConfigured } from '@/lib/agent'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import { CEILING_MESSAGE, withinDailyCeiling } from '@/lib/ceiling'
import { getStore, resetLedger, USER_ID } from '@/lib/ledger'
import { type ParkKind, parkLoopByUser } from '@/lib/park'
import {
  cleanEmail,
  cleanPersonName,
  INBOX_COOKIE,
  PURPOSE_COOKIE,
  parsePurpose,
  YOU_COOKIE,
} from '@/lib/profile'
import { resolveLoopByUser } from '@/lib/resolve'
import { restoreLoopByUser } from '@/lib/restore'
import { isSameOrigin } from '@/lib/same-origin'

/**
 * Next checks a Server Action's Origin against Host only when Origin is present, and lets a request
 * with no Origin through. Every server action in this file that writes refuses those; a browser
 * always sends Origin on the POST behind a button or a form, so the app is unchanged.
 */
async function requireSameOrigin(): Promise<void> {
  if (!isSameOrigin(await headers(), ''))
    throw new Error('Refused: request did not come from this app')
}

/** "I already did this": the user closes a loop by hand, cancelling what it leaves behind (SPEC §8B). */
export async function markDone(loopId: string): Promise<void> {
  await requireSameOrigin()
  const store = await getStore()
  if (!(await resolveLoopByUser(store, USER_ID, loopId))) return
  revalidatePath('/')
  revalidatePath(`/loops/${loopId}`)
  revalidatePath('/activity')
}

/**
 * "Remind me tomorrow" and "Ignore" (SPEC §8B): park the loop in Watching so it stops asking for
 * attention, and leave a reason in the timeline. Neither calls the agent.
 */
async function park(loopId: string, kind: ParkKind): Promise<void> {
  const store = await getStore()
  if (!(await parkLoopByUser(store, USER_ID, loopId, kind))) return
  revalidatePath('/')
  revalidatePath(`/loops/${loopId}`)
  revalidatePath('/activity')
}

/** Undo for a swipe or a hover move: back to the state before, proposals restored (SPEC §8B). */
export async function undoMove(loopId: string, previous: LoopStatus, since: string): Promise<void> {
  await requireSameOrigin()
  const store = await getStore()
  if (!(await restoreLoopByUser(store, USER_ID, loopId, previous, since))) return
  revalidatePath('/')
  revalidatePath('/decisions')
  revalidatePath(`/loops/${loopId}`)
  revalidatePath('/activity')
}

export async function remindTomorrow(loopId: string): Promise<void> {
  await requireSameOrigin()
  await park(loopId, 'remind')
}

export async function ignoreLoop(loopId: string): Promise<void> {
  await requireSameOrigin()
  await park(loopId, 'ignore')
}

/**
 * Approval gate (ADR-0005): flips the record to APPROVED, then asks the deployed agent to execute it.
 * The agent re-checks the status in code before any effect runs. Without a runtime configured the
 * record is approved and left for a later `handle`.
 */
export async function approveAction(actionId: string): Promise<void> {
  await requireSameOrigin()
  // Before the record moves, so a refusal leaves the approval to be made again rather than half done.
  if (scanConfigured && !(await withinDailyCeiling())) throw new Error(CEILING_MESSAGE)
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
  revalidatePath('/decisions')
  revalidatePath(`/loops/${action.loopId}`)
  revalidatePath('/activity')
}

export async function cancelAction(actionId: string): Promise<void> {
  await requireSameOrigin()
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
  revalidatePath('/')
  revalidatePath('/decisions')
  revalidatePath(`/loops/${action.loopId}`)
  revalidatePath('/activity')
}

/**
 * First visit: the person names their agent (#108). The name lives in a cookie beside the theme
 * and replaces "Your agent" everywhere; Today then opens with the tour.
 */
export async function nameAgent(form: FormData): Promise<void> {
  await requireSameOrigin()
  const raw = form.get('name')
  const name = cleanAgentName(typeof raw === 'string' ? raw : undefined) ?? 'Loop'
  const jar = await cookies()
  jar.set(AGENT_COOKIE, name, { path: '/', maxAge: 31536000, sameSite: 'lax' })
  setProfileCookies(jar, form)
  redirect('/?tour=1')
}

/** The person's name, the inbox the agent reads and what it is for (#150); a bad value keeps the old one. */
export async function updateProfile(form: FormData): Promise<void> {
  await requireSameOrigin()
  setProfileCookies(await cookies(), form)
  revalidatePath('/', 'layout')
}

function setProfileCookies(jar: Awaited<ReturnType<typeof cookies>>, form: FormData): void {
  const field = (key: string) => {
    const v = form.get(key)
    return typeof v === 'string' ? v : undefined
  }
  const you = cleanPersonName(field('you'))
  const inbox = cleanEmail(field('inbox'))
  const purpose = parsePurpose(field('purpose'))
  const opts = { path: '/', maxAge: 31536000, sameSite: 'lax' as const }
  if (you) jar.set(YOU_COOKIE, you, opts)
  if (inbox) jar.set(INBOX_COOKIE, inbox, opts)
  if (purpose) jar.set(PURPOSE_COOKIE, purpose, opts)
}

/** Rename the agent from Settings: same cookie as the welcome screen, no redirect. */
export async function renameAgent(form: FormData): Promise<void> {
  await requireSameOrigin()
  const raw = form.get('name')
  const name = cleanAgentName(typeof raw === 'string' ? raw : undefined)
  if (!name) return
  const jar = await cookies()
  jar.set(AGENT_COOKIE, name, { path: '/', maxAge: 31536000, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}

/** Reset the demo ledger (#29 from the web). Destructive on the shared table; the button confirms in place. */
export async function resetDemo(): Promise<string> {
  await requireSameOrigin()
  const result = await resetLedger(USER_ID)
  revalidatePath('/', 'layout')
  return result
}
