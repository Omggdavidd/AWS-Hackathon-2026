import { randomUUID } from 'node:crypto'
import {
  type AuditEvent,
  applyTransition,
  canTransition,
  type EmailMessage,
  type Evidence,
  type IngestionSource,
  type InvestigatorOutput,
  type LedgerStore,
  OpenLoop,
  type ProposedAction,
} from '@openloop/shared'
import type { Specialists } from './agents'
import { elapsed, type Logger, noopLogger, timed } from './log'

export interface ScanOptions {
  source: IngestionSource
  store: LedgerStore
  userId: string
  specialists: Specialists
  now?: string
  /** Bounded backfill window start (SPEC §11). Messages before it are ignored. */
  after?: string
  /** Threads processed at the same time; writes stay ordered within a thread and within a loop. */
  concurrency?: number
  onEvent?: (event: ScanEvent) => void
  /** Structured pipeline logging (#30). Defaults to silence. */
  logger?: Logger
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
  /**
   * Threads whose pipeline threw. The scan carries on; the rest of the inbox still lands. A thread
   * that threw after its loop reached the ledger is counted in both `created` and here, so `created`
   * never reports fewer loops than a person can see.
   */
  failed: number
  byStatus: Record<string, number>
}

/** Threads run in parallel; three keeps the Bedrock round trips overlapping without hammering it. */
const DEFAULT_CONCURRENCY = 3

/**
 * The Orchestrator (ADR-0003): groups messages by thread, runs Extractor, Investigator and Risk Judge
 * per new thread, and writes the ledger. A thread that already has a loop takes the delta path: only
 * messages the loop has not seen go to the Investigator, which may transition the loop with a reason.
 * Threads run concurrently, so the ledger writes are guarded: `commit` keeps the duplicate check and
 * the claim it makes atomic, and `loopLock` serializes the read-modify-write of one loop. A new
 * loop's row is written last, after the evidence it hangs from, so a thread that fails partway
 * leaves nothing a person can see.
 */
export async function runScan(opts: ScanOptions): Promise<ScanSummary> {
  const { source, store, userId, specialists } = opts
  const now = opts.now ?? new Date().toISOString()
  const emit = opts.onEvent ?? (() => {})
  const log = opts.logger ?? noopLogger
  const startedAt = Date.now()
  const messages = await source.listMessages(opts.after ? { after: opts.after } : {})
  const threads = groupByThread(messages)
  log({ evt: 'scan_started', messages: messages.length, threads: threads.size })
  const summary: ScanSummary = {
    threads: threads.size,
    skipped: 0,
    created: 0,
    updated: 0,
    failed: 0,
    byStatus: {},
  }
  const commit = mutex()
  const loopLock = keyedMutex()
  /** Loops this scan opened, by source id: the only writes a ledger query can be too early to see. */
  const opened = new Map<string, OpenLoop[]>()

  /** Loops in the ledger this thread would take over rather than open a second loop beside. */
  async function knownFor(threadId: string, sourceIds: string[]): Promise<OpenLoop[]> {
    return (
      await Promise.all(
        sourceIds.map(async (id) =>
          (await store.findLoopsBySource(userId, id)).filter((l) => claims(l, threadId, id)),
        ),
      )
    ).flat()
  }

  function openedFor(threadId: string, sourceIds: string[]): OpenLoop[] {
    return sourceIds.flatMap((id) => (opened.get(id) ?? []).filter((l) => claims(l, threadId, id)))
  }

  function remember(loop: OpenLoop): void {
    for (const ref of loop.sourceRefs) {
      opened.set(ref.sourceId, [...(opened.get(ref.sourceId) ?? []), loop])
    }
  }

  /**
   * An open loop is the one to update; a resolved one still beats opening a duplicate of it. Among
   * resolved ones a loop that already carries this thread wins: that loop is this thread's, while a
   * loop matched only through a source the investigation cited belongs to another thread. Stated
   * here rather than left to the order the candidates arrive in, which changed with every rewrite of
   * the duplicate check and silently moved a thread's mail onto a different loop.
   */
  function pick(candidates: OpenLoop[], threadId: string): OpenLoop | undefined {
    return (
      candidates.find((l) => l.status !== 'RESOLVED') ??
      candidates.find((l) => l.sourceRefs.some((r) => r.threadId === threadId)) ??
      candidates[0]
    )
  }

  async function findExisting(
    threadId: string,
    sourceIds: string[],
  ): Promise<OpenLoop | undefined> {
    return pick(await knownFor(threadId, sourceIds), threadId)
  }

  async function takeDeltaPath(
    match: OpenLoop,
    thread: EmailMessage[],
    threadId: string,
    threadStartedAt: number,
    record: (event: ScanEvent) => void,
  ): Promise<void> {
    await loopLock(match.id, async () => {
      const existing = await store.getLoop(userId, match.id)
      // Only a loop this scan claimed can be missing, and only when the thread that claimed it died
      // before publishing the row. This thread's mail belongs to that loop, so it fails with it
      // rather than publishing a loop whose evidence nobody wrote.
      if (!existing) throw new Error(`loop ${match.id} was claimed but never published`)
      const seen = new Set<string>([
        ...existing.sourceRefs.map((r) => r.sourceId),
        ...(await store.listEvidence(existing.id)).map((e) => e.sourceId),
      ])
      const newMessages = thread.filter((m) => !seen.has(m.id))
      if (newMessages.length === 0) {
        summary.skipped++
        record({ type: 'skipped', threadId, reason: 'already tracked' })
        log({
          evt: 'thread_skipped',
          threadId,
          reason: 'already tracked',
          ms: elapsed(threadStartedAt),
        })
        return
      }
      const changed = await updateLoop({
        store,
        userId,
        specialists,
        loop: existing,
        newMessages,
        thread,
        now,
        log,
      })
      if (changed) {
        summary.updated++
        record({ type: 'updated', ...changed })
        log({
          evt: 'loop_updated',
          threadId,
          loopId: changed.loop.id,
          from: changed.from,
          to: changed.to,
          priority: changed.loop.priority,
          riskLevel: changed.loop.riskLevel,
          interruptUser: changed.loop.interruptUser,
          ms: elapsed(threadStartedAt),
        })
      } else {
        summary.skipped++
        record({ type: 'skipped', threadId, reason: 'new messages recorded; state unchanged' })
        log({
          evt: 'thread_skipped',
          threadId,
          reason: 'new messages recorded; state unchanged',
          ms: elapsed(threadStartedAt),
        })
      }
    })
  }

  async function processThread(
    threadId: string,
    thread: EmailMessage[],
    record: (event: ScanEvent) => void,
  ): Promise<void> {
    const root = thread[0]
    if (!root) return
    const threadStartedAt = Date.now()
    record({ type: 'thread', threadId, subject: root.subject })
    // The thread id, not the subject: subject lines are often the sensitive part, and the id is
    // enough to find the thread in the ledger (docs/architecture.md §4).
    log({ evt: 'thread_started', threadId, messages: thread.length })

    const threadIds = thread.map((m) => m.id)
    const existing = await findExisting(threadId, threadIds)
    if (existing) return takeDeltaPath(existing, thread, threadId, threadStartedAt, record)

    const extracted = await timed(log, { evt: 'role', role: 'extract', threadId }, () =>
      specialists.extract({ thread, now }),
    )
    if (!extracted.isResponsibility || !extracted.candidate) {
      summary.skipped++
      record({ type: 'skipped', threadId, reason: extracted.rationale })
      log({
        evt: 'thread_skipped',
        threadId,
        reason: extracted.rationale,
        ms: elapsed(threadStartedAt),
      })
      return
    }
    const candidate = extracted.candidate

    const investigation = await timed(log, { evt: 'role', role: 'investigate', threadId }, () =>
      specialists.investigate({ candidate, thread, now }),
    )
    const judgment = await timed(log, { evt: 'role', role: 'judge', threadId }, () =>
      specialists.judge({
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
      }),
    )

    const loopId = randomUUID()
    const sourceIds = new Set<string>([candidate.sourceRef.sourceId])
    for (const e of investigation.evidence) sourceIds.add(e.sourceRef.sourceId)
    const status = investigation.proposedStatus
    const loop = OpenLoop.parse({
      id: loopId,
      userId,
      title: candidate.title,
      category: candidate.category,
      area: candidate.area,
      status,
      owner: status === 'WAITING' ? 'other' : status === 'WATCHING' ? 'nobody' : 'user',
      actionType: candidate.actionType,
      requestedBy: candidate.requestedBy,
      dueAt: candidate.dueAt,
      amount: candidate.amount,
      consequence: judgment.consequence,
      riskLevel: judgment.riskTier,
      priority: judgment.priority,
      interruptUser: judgment.interruptUser,
      confidence: Math.min(extracted.confidence, investigation.confidence),
      nextAction: judgment.nextAction,
      waitingOn: investigation.waitingOn,
      sourceRefs: [...sourceIds].map((id) => {
        const m = messages.find((x) => x.id === id)
        if (!m) return { sourceType: 'calendar', sourceId: id }
        // A quoted message keeps its id but not its thread: see `claims`.
        return m.threadId === threadId
          ? { sourceType: 'email', sourceId: id, threadId: m.threadId }
          : { sourceType: 'email', sourceId: id }
      }),
      createdAt: now,
      updatedAt: now,
      resolvedAt: status === 'RESOLVED' ? now : undefined,
    })

    // The thread's own ids were queried before the model ran and nothing outside this scan writes
    // to the ledger, so only the ids the Investigator brought in are still unchecked. Query them
    // here: `commit` is one global queue, and a query inside it makes every thread wait on every
    // other thread's reads.
    const cited = [...sourceIds].filter((id) => !threadIds.includes(id))
    const known = cited.length > 0 ? await knownFor(threadId, cited) : []

    let actionCount = 0
    let published = false
    /**
     * Everything the loop is made of, then the row that makes it visible. Evidence is only reachable
     * through its loop, so a thread that dies while writing it leaves nothing a person can see;
     * publishing the row first left loops with an empty evidence panel and no history whenever a
     * later write threw, and the per-thread catch turned that into a silent one. Runs under the
     * loop's own lock, like every other write to a loop: `commit` has already claimed it, so another
     * thread can be on its delta path.
     */
    const write = async (): Promise<void> => {
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

      await store.putLoop(loop)
      published = true

      try {
        await store.appendAudit(
          audit(
            userId,
            loopId,
            'loop_created',
            `${extracted.rationale} ${investigation.rationale}`.trim(),
            now,
          ),
        )

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
      } catch (err) {
        // The row is already in the ledger and a person will read it. Say in its own history that
        // the thread failed, rather than show a loop that cannot explain what is missing from it.
        await store
          .appendAudit(
            audit(
              userId,
              loopId,
              'loop_created',
              `The scan of this thread failed after the loop was opened, so it may be missing proposed actions: ${
                err instanceof Error ? err.message : String(err)
              }`,
              now,
            ),
          )
          .catch(() => {})
        throw err
      }
    }

    const claimed = await commit(async () => {
      // What the queries above cannot have seen is a loop another thread opened since; `opened`
      // holds exactly those, and is written in this same section.
      const duplicate = pick(
        [...known, ...openedFor(threadId, [...sourceIds, ...threadIds])],
        threadId,
      )
      if (duplicate) return { duplicate }
      remember(loop)
      // The lock is taken inside the section that claimed the loop, not after it: `commit` is one
      // queue, so any thread that later finds this claim in `opened` queues behind `write` and
      // cannot read the loop before its records are there.
      return { write: loopLock(loopId, write) }
    })
    if ('duplicate' in claimed) {
      return takeDeltaPath(claimed.duplicate, thread, threadId, threadStartedAt, record)
    }

    try {
      await claimed.write
    } finally {
      // Counted from the row, not from the end of the write: a throw after `putLoop` must not leave
      // the summary reporting fewer loops than the ledger holds.
      if (published) {
        summary.created++
        summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1
        record({ type: 'loop', loop, actions: actionCount })
        log({
          evt: 'loop_created',
          threadId,
          loopId,
          status,
          priority: loop.priority,
          riskLevel: loop.riskLevel,
          interruptUser: loop.interruptUser,
          actions: actionCount,
          ms: elapsed(threadStartedAt),
        })
      }
    }
  }

  const queue = [...threads]
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const entry = queue[cursor++]
      if (!entry) continue
      const buffered: ScanEvent[] = []
      try {
        await processThread(entry[0], entry[1], (event) => buffered.push(event))
      } catch (err) {
        // One thread's failure is not the inbox's. The id and the message only: nothing a subject
        // or a body could travel in reaches the log (docs/architecture.md §4).
        summary.failed++
        log({
          evt: 'thread_failed',
          threadId: entry[0],
          error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        })
      } finally {
        for (const event of buffered) emit(event)
      }
    }
  }
  const workers = Math.max(1, Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, queue.length))
  await Promise.all(Array.from({ length: workers }, worker))

  await store.appendAudit({
    ...audit(
      userId,
      undefined,
      'scan_completed',
      `Scanned ${messages.length} messages in ${threads.size} threads; ${summary.created} loops created${
        summary.failed > 0 ? `; ${summary.failed} threads failed` : ''
      }`,
      now,
    ),
    details: {
      messages: messages.length,
      threads: threads.size,
      created: summary.created,
      failed: summary.failed,
    },
  })
  emit({ type: 'done', summary })
  log({ evt: 'scan_completed', ...summary, ms: elapsed(startedAt) })
  return summary
}

/**
 * Whether a loop belongs to this thread, and so whether the thread updates it instead of opening one
 * of its own. A shared source id is not enough: the Investigator reads the whole inbox and may quote
 * mail from anywhere, and a quote must leave the quoted thread free to open its own loop. Ownership
 * is a ref carrying this thread's id, or a match on the source the loop was opened from (its first
 * ref) — which is how a receipt arriving in another thread still closes it.
 */
function claims(loop: OpenLoop, threadId: string, matchedSourceId: string): boolean {
  return (
    loop.sourceRefs.some((r) => r.threadId === threadId) ||
    loop.sourceRefs[0]?.sourceId === matchedSourceId
  )
}

/** Runs sections one after another: a section holding an `await` would otherwise interleave. */
function mutex() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(section: () => Promise<T>): Promise<T> => {
    const next = tail.then(section)
    tail = next.catch(() => {})
    return next
  }
}

/** One queue per key, so unrelated keys still run in parallel. */
function keyedMutex() {
  const tails = new Map<string, Promise<unknown>>()
  return <T>(key: string, section: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(section)
    tails.set(
      key,
      next.catch(() => {}),
    )
    return next
  }
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
  log: Logger
}): Promise<
  { loop: OpenLoop; from: OpenLoop['status']; to: OpenLoop['status']; reason: string } | undefined
> {
  const { store, userId, specialists, loop, newMessages, thread, now, log } = input
  const existingEvidence = await store.listEvidence(loop.id)
  const threadId = loop.sourceRefs.find((r) => r.threadId)?.threadId
  const result = await timed(
    log,
    { evt: 'role', role: 'update', ...(threadId ? { threadId } : {}) },
    () => specialists.update({ loop, existingEvidence, newMessages, thread, now }),
  )

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
  // The Investigator proposes a state; the lifecycle decides whether the loop can reach it. A
  // resolved loop cannot go back to uncertain, and `findExisting` hands a resolved loop to a
  // thread whose update can say exactly that. Refusing it costs one loop its state change;
  // letting `applyTransition` throw would cost the scan every thread still in flight.
  const transitioned = canTransition(from, to)
  const refused = !transitioned && to !== from
  if (transitioned) {
    next = applyTransition(next, to, now)
    next.owner =
      to === 'WAITING' ? 'other' : to === 'WATCHING' || to === 'RESOLVED' ? 'nobody' : 'user'

    // What a responsibility costs you depends on the state it is in, so a state change re-opens the
    // question the Risk Judge answered at creation. Without this the consequence, priority and
    // interrupt decision stay frozen at the first message: a loop that was Waiting on someone and
    // now asks something of the user would keep the low priority it earned while it was somebody
    // else's move, and would never interrupt. Only on a transition, never on evidence alone — this
    // is a model call, and new mail in a tracked thread is far more often confirmation than change.
    const judgment = await timed(
      log,
      { evt: 'role', role: 'judge', ...(threadId ? { threadId } : {}) },
      () =>
        specialists.judge({
          loop: {
            title: next.title,
            category: next.category,
            actionType: next.actionType,
            status: to,
            ...(next.dueAt ? { dueAt: next.dueAt } : {}),
            ...(next.amount ? { amount: next.amount } : {}),
            ...(next.requestedBy ? { requestedBy: next.requestedBy } : {}),
            ...(next.waitingOn ? { waitingOn: next.waitingOn } : {}),
          },
          evidence: [...existingEvidence.map(asJudgeEvidence), ...result.evidence],
          now,
        }),
    )
    next.consequence = judgment.consequence
    next.riskLevel = judgment.riskTier
    next.priority = judgment.priority
    next.interruptUser = judgment.interruptUser
    next.nextAction = judgment.nextAction
  }
  await store.putLoop(next)
  const messageIds = newMessages.map((m) => m.id)
  if (transitioned) {
    await store.appendAudit({
      ...audit(userId, loop.id, 'state_changed', `${result.rationale} ${from} -> ${to}`, now),
      details: { from, to, messages: messageIds },
    })
  } else if (refused) {
    await store.appendAudit({
      ...audit(
        userId,
        loop.id,
        'evidence_added',
        `${result.rationale} ${from} -> ${to} is not a move this loop can make, so it stays ${from}`,
        now,
      ),
      details: { from, proposed: to, messages: messageIds },
    })
  } else {
    await store.appendAudit({
      ...audit(userId, loop.id, 'evidence_added', result.rationale, now),
      details: { messages: messageIds },
    })
  }
  return transitioned ? { loop: next, from, to, reason: result.rationale } : undefined
}

/**
 * Stored evidence in the shape the Risk Judge takes. The judge reads model output, which nests the
 * source into a `sourceRef`; a stored record spreads those fields across the row.
 */
function asJudgeEvidence(e: Evidence): InvestigatorOutput['evidence'][number] {
  return {
    sourceRef: {
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      ...(e.threadId ? { threadId: e.threadId } : {}),
    },
    observedAt: e.observedAt,
    excerpt: e.excerpt,
    supports: e.supports,
    confidence: e.confidence,
  }
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
