import { randomUUID } from 'node:crypto'
import {
  type ActionSink,
  type AuditEvent,
  applyTransition,
  canTransition,
  type IngestionSource,
  type LedgerStore,
  mayExecute,
  type ProposedAction,
} from '@openloop/shared'
import type { Specialists } from './agents'

export interface ExecuteOptions {
  store: LedgerStore
  source: IngestionSource
  sink: ActionSink
  userId: string
  specialists: Specialists
  now?: string
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
  const action = await store.getAction(userId, actionId)
  if (!action) return { actionId, status: 'FAILED', summary: 'unknown action' }
  const gate = mayExecute(action)
  if (!gate.ok) {
    await store.appendAudit(
      audit(userId, action, 'action_failed', `Not executed: ${gate.reason}`, now),
    )
    return { actionId, status: action.status, summary: gate.reason }
  }
  const loop = await store.getLoop(userId, action.loopId)
  if (!loop) return { actionId, status: 'FAILED', summary: 'loop not found' }
  const evidence = await store.listEvidence(loop.id)
  const threadId = loop.sourceRefs.find((r) => r.threadId)?.threadId
  const thread = threadId ? await source.getThread(threadId) : []

  try {
    const plan = await specialists.plan({ loop, evidence, action, thread, now })
    const result = await sink.execute(action, plan)
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
    if (plan.loopStatusAfter && canTransition(loop.status, plan.loopStatusAfter)) {
      const moved = applyTransition(loop, plan.loopStatusAfter, now)
      await store.putLoop(moved)
      await store.appendAudit({
        ...audit(
          userId,
          action,
          'state_changed',
          `${plan.summary}; ${loop.status} -> ${moved.status}`,
          now,
        ),
        details: { from: loop.status, to: moved.status },
      })
    }
    return { actionId, status: 'EXECUTED', summary: result.summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await store.putAction({ ...action, status: 'FAILED', error: message.slice(0, 500) })
    await store.appendAudit(audit(userId, action, 'action_failed', message.slice(0, 500), now))
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
