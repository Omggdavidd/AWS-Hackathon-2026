import { randomUUID } from 'node:crypto'
import {
  type AuditEvent,
  applyTransition,
  type EmailMessage,
  type Evidence,
  type IngestionSource,
  type LedgerStore,
  OpenLoop,
  type ProposedAction,
} from '@openloop/shared'
import type { Specialists } from './agents'

export interface ScanOptions {
  source: IngestionSource
  store: LedgerStore
  userId: string
  specialists: Specialists
  now?: string
  /** Bounded backfill window start (SPEC §11). Messages before it are ignored. */
  after?: string
  onEvent?: (event: ScanEvent) => void
}

export type ScanEvent =
  | { type: 'thread'; threadId: string; subject: string }
  | { type: 'skipped'; threadId: string; reason: string }
  | { type: 'loop'; loop: OpenLoop; actions: number }
  | {
      type: 'updated'
      loop: OpenLoop
      from: OpenLoop['status']
      to: OpenLoop['status']
      reason: string
    }
  | { type: 'done'; summary: ScanSummary }

export interface ScanSummary {
  threads: number
  skipped: number
  created: number
  updated: number
  byStatus: Record<string, number>
}

/**
 * The Orchestrator (ADR-0003): groups messages by thread, runs Extractor, Investigator and Risk Judge
 * per new thread, and writes the ledger. A thread that already has a loop takes the delta path: only
 * messages the loop has not seen go to the Investigator, which may transition the loop with a reason.
 */
export async function runScan(opts: ScanOptions): Promise<ScanSummary> {
  const { source, store, userId, specialists } = opts
  const now = opts.now ?? new Date().toISOString()
  const emit = opts.onEvent ?? (() => {})
  const messages = await source.listMessages(opts.after ? { after: opts.after } : {})
  const threads = groupByThread(messages)
  const summary: ScanSummary = {
    threads: threads.size,
    skipped: 0,
    created: 0,
    updated: 0,
    byStatus: {},
  }

  for (const [threadId, thread] of threads) {
    const root = thread[0]
    if (!root) continue
    emit({ type: 'thread', threadId, subject: root.subject })

    const known = (
      await Promise.all(thread.map((m) => store.findLoopsBySource(userId, m.id)))
    ).flat()
    const existing = known.find((l) => l.status !== 'RESOLVED') ?? known[0]
    if (existing) {
      const seen = new Set<string>([
        ...existing.sourceRefs.map((r) => r.sourceId),
        ...(await store.listEvidence(existing.id)).map((e) => e.sourceId),
      ])
      const newMessages = thread.filter((m) => !seen.has(m.id))
      if (newMessages.length === 0) {
        summary.skipped++
        emit({ type: 'skipped', threadId, reason: 'already tracked' })
        continue
      }
      const changed = await updateLoop({
        store,
        userId,
        specialists,
        loop: existing,
        newMessages,
        thread,
        now,
      })
      if (changed) {
        summary.updated++
        emit({ type: 'updated', ...changed })
      } else {
        summary.skipped++
        emit({ type: 'skipped', threadId, reason: 'new messages recorded; state unchanged' })
      }
      continue
    }

    const extracted = await specialists.extract({ thread, now })
    if (!extracted.isResponsibility || !extracted.candidate) {
      summary.skipped++
      emit({ type: 'skipped', threadId, reason: extracted.rationale })
      continue
    }
    const candidate = extracted.candidate

    const investigation = await specialists.investigate({ candidate, thread, now })
    const judgment = await specialists.judge({
      loop: {
        title: candidate.title,
        category: candidate.category,
        actionType: candidate.actionType,
        status: investigation.proposedStatus,
        ...(candidate.dueAt ? { dueAt: candidate.dueAt } : {}),
        ...(candidate.amount ? { amount: candidate.amount } : {}),
        ...(candidate.requestedBy ? { requestedBy: candidate.requestedBy } : {}),
        ...(investigation.waitingOn ? { waitingOn: investigation.waitingOn } : {}),
      },
      evidence: investigation.evidence,
      now,
    })

    const loopId = randomUUID()
    const sourceIds = new Set<string>([candidate.sourceRef.sourceId])
    for (const e of investigation.evidence) sourceIds.add(e.sourceRef.sourceId)
    const status = investigation.proposedStatus
    const loop = OpenLoop.parse({
      id: loopId,
      userId,
      title: candidate.title,
      category: candidate.category,
      status,
      owner: status === 'WAITING' ? 'other' : status === 'WATCHING' ? 'nobody' : 'user',
      actionType: candidate.actionType,
      requestedBy: candidate.requestedBy,
      dueAt: candidate.dueAt,
      amount: candidate.amount,
      consequence: judgment.consequence,
      riskLevel: judgment.riskTier,
      priority: judgment.priority,
      confidence: Math.min(extracted.confidence, investigation.confidence),
      nextAction: judgment.nextAction,
      waitingOn: investigation.waitingOn,
      sourceRefs: [...sourceIds].map((id) => {
        const m = messages.find((x) => x.id === id)
        return m
          ? { sourceType: 'email', sourceId: id, threadId: m.threadId }
          : { sourceType: 'calendar', sourceId: id }
      }),
      createdAt: now,
      updatedAt: now,
      resolvedAt: status === 'RESOLVED' ? now : undefined,
    })
    await store.putLoop(loop)

    for (const e of investigation.evidence) {
      const evidence: Evidence = {
        id: randomUUID(),
        loopId,
        sourceType: e.sourceRef.sourceType,
        sourceId: e.sourceRef.sourceId,
        ...(e.sourceRef.threadId ? { threadId: e.sourceRef.threadId } : {}),
        observedAt: e.observedAt,
        excerpt: e.excerpt,
        supports: e.supports,
        confidence: e.confidence,
      }
      await store.appendEvidence(evidence)
    }

    await store.appendAudit(
      audit(
        userId,
        loopId,
        'loop_created',
        `${extracted.rationale} ${investigation.rationale}`.trim(),
        now,
      ),
    )

    let actionCount = 0
    for (const proposed of judgment.proposedActions) {
      const action: ProposedAction = {
        id: randomUUID(),
        loopId,
        userId,
        type: proposed.type,
        riskTier: proposed.riskTier,
        requiresApproval: proposed.riskTier === 'high',
        summary: proposed.summary,
        payload: proposed.payload,
        status: 'PROPOSED',
        createdAt: now,
      }
      await store.putAction(action)
      await store.appendAudit({
        ...audit(userId, loopId, 'action_proposed', proposed.summary, now),
        actionId: action.id,
      })
      actionCount++
    }

    summary.created++
    summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1
    emit({ type: 'loop', loop, actions: actionCount })
  }

  await store.appendAudit({
    ...audit(
      userId,
      undefined,
      'scan_completed',
      `Scanned ${messages.length} messages in ${threads.size} threads; ${summary.created} loops created`,
      now,
    ),
    details: { messages: messages.length, threads: threads.size, created: summary.created },
  })
  emit({ type: 'done', summary })
  return summary
}

/** Delta path: record evidence for unseen messages and transition the loop if the Investigator says so. */
async function updateLoop(input: {
  store: LedgerStore
  userId: string
  specialists: Specialists
  loop: OpenLoop
  newMessages: EmailMessage[]
  thread: EmailMessage[]
  now: string
}): Promise<
  { loop: OpenLoop; from: OpenLoop['status']; to: OpenLoop['status']; reason: string } | undefined
> {
  const { store, userId, specialists, loop, newMessages, thread, now } = input
  const existingEvidence = await store.listEvidence(loop.id)
  const result = await specialists.update({ loop, existingEvidence, newMessages, thread, now })

  for (const e of result.evidence) {
    await store.appendEvidence({
      id: randomUUID(),
      loopId: loop.id,
      sourceType: e.sourceRef.sourceType,
      sourceId: e.sourceRef.sourceId,
      ...(e.sourceRef.threadId ? { threadId: e.sourceRef.threadId } : {}),
      observedAt: e.observedAt,
      excerpt: e.excerpt,
      supports: e.supports,
      confidence: e.confidence,
    })
  }
  const knownRefs = new Set(loop.sourceRefs.map((r) => r.sourceId))
  const sourceRefs = [
    ...loop.sourceRefs,
    ...newMessages
      .filter((m) => !knownRefs.has(m.id))
      .map((m) => ({ sourceType: 'email' as const, sourceId: m.id, threadId: m.threadId })),
  ]

  let next: OpenLoop = { ...loop, sourceRefs, updatedAt: now, confidence: result.confidence }
  if (result.waitingOn) next.waitingOn = result.waitingOn
  const from = loop.status
  const to = result.proposedStatus
  const transitioned = to !== from
  if (transitioned) {
    next = applyTransition(next, to, now)
    next.owner =
      to === 'WAITING' ? 'other' : to === 'WATCHING' || to === 'RESOLVED' ? 'nobody' : 'user'
  }
  await store.putLoop(next)
  await store.appendAudit(
    transitioned
      ? {
          ...audit(userId, loop.id, 'state_changed', `${result.rationale} ${from} -> ${to}`, now),
          details: { from, to, messages: newMessages.map((m) => m.id) },
        }
      : {
          ...audit(userId, loop.id, 'evidence_added', result.rationale, now),
          details: { messages: newMessages.map((m) => m.id) },
        },
  )
  return transitioned ? { loop: next, from, to, reason: result.rationale } : undefined
}

function groupByThread(messages: EmailMessage[]): Map<string, EmailMessage[]> {
  const map = new Map<string, EmailMessage[]>()
  for (const m of messages) map.set(m.threadId, [...(map.get(m.threadId) ?? []), m])
  return map
}

function audit(
  userId: string,
  loopId: string | undefined,
  kind: AuditEvent['kind'],
  reason: string,
  at: string,
): AuditEvent {
  return {
    id: randomUUID(),
    userId,
    ...(loopId ? { loopId } : {}),
    at,
    kind,
    actor: 'agent',
    reason: reason.slice(0, 500),
  }
}
