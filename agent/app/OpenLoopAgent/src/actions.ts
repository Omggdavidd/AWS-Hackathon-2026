import { randomUUID } from 'node:crypto'
import {
  type ActionPlan,
  type ActionSink,
  type AuditEvent,
  applyTransition,
  canTransition,
  type IngestionSource,
  type LedgerStore,
  mayExecute,
  type ProposedAction,
  type ProposedActionType,
} from '@openloop/shared'
import type { Specialists } from './agents'
import { elapsed, type Logger, noopLogger, timed } from './log'

type EffectKind = ActionPlan['effect']['kind']

/**
 * What each approved action type is allowed to come back as. Nothing in the schemas binds a
 * `ProposedAction.type` to an `ActionPlan.effect.kind`, so without this a `draft_email` the gate
 * cleared can return a `send_email` effect and the sink posts mail the user never approved.
 *
 * Read from the Action Agent prompt: `send_email` is "the shape used for follow-ups", booking a
 * slot with the other party is a reply, and `note` is what the model is told to use "when nothing
 * external is needed" — so every type may under-do its effect with a note, and `pay` and
 * `submit_form` have no effect of their own and can only ever be one. Kinds that are weaker than
 * what was approved (a draft where a send was allowed) pass; kinds that do something else do not.
 */
const ALLOWED_EFFECTS: Record<ProposedActionType, ReadonlySet<EffectKind>> = {
  draft_email: new Set(['draft_email', 'note']),
  send_email: new Set(['send_email', 'draft_email', 'note']),
  follow_up: new Set(['send_email', 'draft_email', 'note']),
  create_calendar_event: new Set(['calendar_event', 'note']),
  // "Reply to Riverside Dental choosing a slot": booking the other party's time is a mail first.
  book_appointment: new Set(['calendar_event', 'send_email', 'draft_email', 'note']),
  remind: new Set(['reminder', 'note']),
  archive_thread: new Set(['archive_thread', 'note']),
  pay: new Set(['note']),
  submit_form: new Set(['note']),
  // The escape hatch names no effect, so no kind can contradict it, and it never runs without a
  // person (NEVER_AUTOMATIC in the shared gate).
  other: new Set([
    'draft_email',
    'send_email',
    'calendar_event',
    'reminder',
    'archive_thread',
    'note',
  ]),
}

export interface ExecuteOptions {
  store: LedgerStore
  source: IngestionSource
  sink: ActionSink
  userId: string
  specialists: Specialists
  now?: string
  /** Structured pipeline logging (#30). Defaults to silence. */
  logger?: Logger
}

export interface ExecuteOutcome {
  actionId: string
  status: ProposedAction['status']
  summary: string
}

/**
 * Run one proposed action through the policy gate, the Action Agent and the sink (ADR-0005).
 * The gate is code: a high-risk action that is not APPROVED never reaches the model or the sink.
 */
export async function executeAction(
  opts: ExecuteOptions,
  actionId: string,
): Promise<ExecuteOutcome> {
  const { store, source, sink, userId, specialists } = opts
  const now = opts.now ?? new Date().toISOString()
  const log = opts.logger ?? noopLogger
  const startedAt = Date.now()
  const action = await store.getAction(userId, actionId)
  if (!action) {
    log({ evt: 'action_failed', actionId, reason: 'unknown action' })
    return { actionId, status: 'FAILED', summary: 'unknown action' }
  }
  log({
    evt: 'action_started',
    actionId,
    loopId: action.loopId,
    type: action.type,
    riskTier: action.riskTier,
  })
  const gate = mayExecute(action)
  if (!gate.ok) {
    await store.appendAudit(
      audit(userId, action, 'action_failed', `Not executed: ${gate.reason}`, now),
    )
    log({
      evt: 'action_blocked',
      actionId,
      loopId: action.loopId,
      reason: gate.reason,
      ms: elapsed(startedAt),
    })
    return { actionId, status: action.status, summary: gate.reason }
  }
  const loop = await store.getLoop(userId, action.loopId)
  if (!loop) {
    log({ evt: 'action_failed', actionId, loopId: action.loopId, reason: 'loop not found' })
    return { actionId, status: 'FAILED', summary: 'loop not found' }
  }
  const evidence = await store.listEvidence(loop.id)
  const threadId = loop.sourceRefs.find((r) => r.threadId)?.threadId
  const thread = threadId ? await source.getThread(threadId) : []

  try {
    const plan = await timed(
      log,
      { evt: 'role', role: 'plan', actionId, ...(threadId ? { threadId } : {}) },
      () => specialists.plan({ loop, evidence, action, thread, now }),
    )
    if (!ALLOWED_EFFECTS[action.type].has(plan.effect.kind))
      // Thrown inside the try so it lands as a normal failure: FAILED, an action_failed audit and
      // a reason a person can read. What was approved is what runs, or nothing does.
      throw new Error(
        `planned a ${plan.effect.kind} effect for a ${action.type} action; that is not what was approved`,
      )
    const result = await timed(
      log,
      // The effect kind only: a draft_email effect carries the recipient, subject and body.
      { evt: 'sink', actionId, effect: plan.effect.kind, ...(threadId ? { threadId } : {}) },
      () => sink.execute(action, plan),
    )
    if (!result.success) throw new Error(result.error ?? 'sink reported failure')
    const evidenceId = randomUUID()
    if (result.resultSourceRef) {
      await store.appendEvidence({
        id: evidenceId,
        loopId: loop.id,
        sourceType: result.resultSourceRef.sourceType,
        sourceId: result.resultSourceRef.sourceId,
        observedAt: now,
        excerpt: result.summary,
        supports: 'UPDATED',
        confidence: 1,
      })
    }
    const executed: ProposedAction = {
      ...action,
      status: 'EXECUTED',
      executedAt: now,
      payload: { ...action.payload, effect: plan.effect },
      ...(result.resultSourceRef ? { resultEvidenceId: evidenceId } : {}),
    }
    await store.putAction(executed)
    await store.appendAudit(audit(userId, action, 'action_executed', result.summary, now))
    if (plan.loopStatusAfter) {
      // `loop` is the snapshot taken before the model and the sink ran, and that window is the
      // length of a real execution — about 20 seconds with "I already did this" on screen. Build
      // the transition from what the ledger says now, or a resolution made in the meantime is
      // silently overwritten and the loop reopens under the user (#66).
      const current = (await store.getLoop(userId, loop.id)) ?? loop
      if (current.status === 'RESOLVED') {
        // The effect still happened and is already recorded above; only the status write is
        // dropped. The user closing a loop outranks what the agent planned before they did.
        log({ evt: 'transition_skipped', actionId, loopId: loop.id, reason: 'already resolved' })
        await store.appendAudit(
          audit(
            userId,
            action,
            'notification',
            `${plan.summary}; you had already marked this done, so it stays closed`,
            now,
          ),
        )
      } else if (canTransition(current.status, plan.loopStatusAfter)) {
        const moved = applyTransition(current, plan.loopStatusAfter, now)
        await store.putLoop(moved)
        await store.appendAudit({
          ...audit(
            userId,
            action,
            'state_changed',
            `${plan.summary}; ${current.status} -> ${moved.status}`,
            now,
          ),
          details: { from: current.status, to: moved.status },
        })
      }
    }
    log({ evt: 'action_executed', actionId, loopId: loop.id, ms: elapsed(startedAt) })
    return { actionId, status: 'EXECUTED', summary: result.summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await store.putAction({ ...action, status: 'FAILED', error: message.slice(0, 500) })
    await store.appendAudit(audit(userId, action, 'action_failed', message.slice(0, 500), now))
    log({
      evt: 'action_failed',
      actionId,
      loopId: loop.id,
      error: message.slice(0, 500),
      ms: elapsed(startedAt),
    })
    return { actionId, status: 'FAILED', summary: message }
  }
}

export interface HandleSummary {
  handled: ExecuteOutcome[]
  needsYou: { actionId: string; loopId: string; summary: string; reason: string }[]
}

/** "Handle what you can" (SPEC §8E): execute every proposed action the policy allows, list the rest. */
export async function handleWhatYouCan(opts: ExecuteOptions): Promise<HandleSummary> {
  const proposed = await opts.store.listActions(opts.userId, { status: 'PROPOSED' })
  const summary: HandleSummary = { handled: [], needsYou: [] }
  const now = opts.now ?? new Date().toISOString()
  for (const action of proposed) {
    const loop = await opts.store.getLoop(opts.userId, action.loopId)
    if (loop?.status === 'RESOLVED') {
      await opts.store.putAction({ ...action, status: 'CANCELLED' })
      await opts.store.appendAudit(
        audit(opts.userId, action, 'action_cancelled', 'Loop already resolved; nothing to do', now),
      )
      continue
    }
    const gate = mayExecute(action)
    if (!gate.ok) {
      summary.needsYou.push({
        actionId: action.id,
        loopId: action.loopId,
        summary: action.summary,
        reason: gate.reason,
      })
      continue
    }
    summary.handled.push(await executeAction(opts, action.id))
  }
  return summary
}

function audit(
  userId: string,
  action: ProposedAction,
  kind: AuditEvent['kind'],
  reason: string,
  at: string,
): AuditEvent {
  return {
    id: randomUUID(),
    userId,
    loopId: action.loopId,
    actionId: action.id,
    at,
    kind,
    actor: 'agent',
    reason: reason.slice(0, 500),
  }
}
