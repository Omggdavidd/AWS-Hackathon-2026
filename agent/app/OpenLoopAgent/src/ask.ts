import {
  type AskAnswer,
  type LedgerStore,
  type LoopArea,
  type LoopStatus,
  mayExecute,
  type OpenLoop,
  type Priority,
  type ProposedAction,
} from '@openloop/shared'
import type { Specialists } from './agents'

export interface AskContext {
  now: string
  counts: Record<LoopStatus, number>
  loops: {
    loopId: string
    title: string
    status: LoopStatus
    priority: Priority
    area: LoopArea
    dueAt?: string
    amount?: string
    requestedBy?: string
    waitingOn?: string
    nextAction?: string
    consequence?: string
    sourceIds: string[]
  }[]
  /** What "Handle what you can" would carry out right now, and what it would leave for the user (ADR-0005). */
  agentCanDo: { loopId: string; summary: string; riskTier: ProposedAction['riskTier'] }[]
  needsApproval: { loopId: string; summary: string; reason: string }[]
}

const STATUS_ORDER: LoopStatus[] = ['NEEDS_YOU', 'WAITING', 'UNCERTAIN', 'WATCHING', 'RESOLVED']
const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']

/** Pure: everything an answer may draw on, from ledger records only. */
export function buildAskContext(
  loops: OpenLoop[],
  actions: ProposedAction[],
  now: string,
): AskContext {
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, loops.filter((l) => l.status === status).length]),
  ) as Record<LoopStatus, number>
  const ranked = [...loops].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'),
  )
  const pending = actions.filter((a) => a.status === 'PROPOSED' || a.status === 'APPROVED')
  const allowed = pending.map((action) => ({ action, gate: mayExecute(action) }))
  return {
    now,
    counts,
    loops: ranked.map((l) => ({
      loopId: l.id,
      title: l.title,
      status: l.status,
      priority: l.priority,
      area: l.area,
      ...(l.dueAt ? { dueAt: l.dueAt } : {}),
      ...(l.amount ? { amount: `${l.amount.value} ${l.amount.currency}` } : {}),
      ...(l.requestedBy ? { requestedBy: l.requestedBy } : {}),
      ...(l.waitingOn ? { waitingOn: l.waitingOn } : {}),
      ...(l.nextAction ? { nextAction: l.nextAction } : {}),
      ...(l.consequence ? { consequence: l.consequence } : {}),
      sourceIds: l.sourceRefs.map((r) => r.sourceId),
    })),
    agentCanDo: allowed
      .filter(({ gate }) => gate.ok)
      .map(({ action }) => ({
        loopId: action.loopId,
        summary: action.summary,
        riskTier: action.riskTier,
      })),
    needsApproval: allowed
      .filter(({ gate }) => !gate.ok)
      .map(({ action, gate }) => ({
        loopId: action.loopId,
        summary: action.summary,
        reason: gate.ok ? '' : gate.reason,
      })),
  }
}

/**
 * The ask command (SPEC §8G): one question answered from the ledger. It reads and never writes, so
 * a free-text prompt can never reach an action sink; work is still done by `handle` behind
 * `mayExecute`. References the model returns are checked against the ledger before they are
 * returned, so the bar never links to a loop or a source that does not exist.
 */
export async function ask(opts: {
  store: LedgerStore
  userId: string
  question: string
  specialists: Pick<Specialists, 'answer'>
  now?: string
}): Promise<AskAnswer & { question: string }> {
  const now = opts.now ?? new Date().toISOString()
  const [loops, actions] = await Promise.all([
    opts.store.listLoops(opts.userId),
    opts.store.listActions(opts.userId),
  ])
  const context = buildAskContext(loops, actions, now)
  const answer = await opts.specialists.answer({ question: opts.question, context, now })
  const byId = new Map(loops.map((l) => [l.id, l]))
  const references = await Promise.all(
    answer.references
      .filter((r) => byId.has(r.loopId))
      .map(async (r) => {
        const loop = byId.get(r.loopId) as OpenLoop
        const known = new Set([
          ...loop.sourceRefs.map((s) => s.sourceId),
          ...(await opts.store.listEvidence(loop.id)).map((e) => e.sourceId),
        ])
        return {
          loopId: loop.id,
          title: loop.title,
          sourceIds: r.sourceIds.filter((id) => known.has(id)),
        }
      }),
  )
  return { ...answer, references, question: opts.question }
}
