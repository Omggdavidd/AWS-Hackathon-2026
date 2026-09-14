import { fileURLToPath } from 'node:url'
import {
  FixtureSource,
  type InvestigatorOutput,
  type LedgerStore,
  LocalLedgerStore,
  OpenLoop,
} from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import type { Specialists } from '../src/agents'
import type { LogLine } from '../src/log'
import { runScan, type ScanEvent } from '../src/scan'

const seed = fileURLToPath(new URL('../../../../demo/seed-inbox.json', import.meta.url))
const deltaSeed = fileURLToPath(new URL('../../../../demo/seed-inbox-delta.json', import.meta.url))
const now = '2026-09-10T13:00:00.000Z'

/** Deterministic stand-ins for the model-backed roles. */
const stubs: Specialists = {
  async extract({ thread }) {
    const root = thread[0]
    if (!root || root.threadId === 'thr-newsletter') {
      return { isResponsibility: false, confidence: 0.95, rationale: 'newsletter' }
    }
    return {
      isResponsibility: true,
      candidate: {
        title: root.subject,
        category: root.threadId === 'thr-deposit' ? 'payment' : 'other',
        area: root.threadId === 'thr-deposit' ? 'school' : 'other',
        actionType: root.threadId === 'thr-deposit' ? 'pay' : 'none',
        sourceRef: { sourceType: 'email', sourceId: root.id, threadId: root.threadId },
        ...(root.threadId === 'thr-deposit'
          ? { dueAt: '2026-09-15T23:59:00-04:00', amount: { value: 200, currency: 'USD' } }
          : {}),
      },
      confidence: 0.9,
      rationale: 'stub',
    }
  },
  async investigate({ thread }) {
    const later = thread.find((m) => /payment received/i.test(m.body))
    const sent = thread.find((m) => m.labels.includes('SENT'))
    return {
      evidence: thread.map((m) => ({
        sourceRef: { sourceType: 'email', sourceId: m.id, threadId: m.threadId },
        observedAt: m.date,
        excerpt: m.snippet,
        supports: m === later ? 'RESOLVED' : m === sent ? 'UPDATED' : 'OPEN',
        confidence: 0.9,
      })),
      proposedStatus: later ? 'RESOLVED' : sent ? 'WAITING' : 'NEEDS_YOU',
      ...(sent ? { waitingOn: 'Bill Okafor' } : {}),
      confidence: 0.9,
      rationale: 'stub',
    }
  },
  async update({ loop, newMessages }) {
    const resolving = newMessages.find((m) => /payment received|approved/i.test(m.body))
    return {
      evidence: newMessages.map((m) => ({
        sourceRef: { sourceType: 'email', sourceId: m.id, threadId: m.threadId },
        observedAt: m.date,
        excerpt: m.snippet,
        supports: m === resolving ? 'RESOLVED' : 'UPDATED',
        confidence: 0.9,
      })),
      proposedStatus: resolving ? 'RESOLVED' : loop.status,
      confidence: 0.9,
      rationale: resolving ? 'stub: resolved by new message' : 'stub: informational',
    }
  },
  async plan({ action }) {
    return { effect: { kind: 'note', text: `stub effect for ${action.type}` }, summary: 'stub' }
  },
  async summarize() {
    return { headline: 'stub', items: [], nothingElse: true }
  },
  async answer() {
    return { answer: 'stub', references: [], suggests: 'none' as const, confidence: 0.9 }
  },
  async judge({ loop }) {
    // Status-aware, like the real prompt: what a responsibility costs you depends on whose move it
    // is. That makes a re-judgment on the delta path visible in the record rather than a no-op.
    const high = loop.actionType === 'pay' && loop.status !== 'RESOLVED'
    return {
      riskTier: high ? 'high' : 'low',
      priority: high ? 'critical' : 'medium',
      consequence: 'stub consequence',
      nextAction: 'stub next action',
      proposedActions: high
        ? [{ type: 'pay', summary: 'Pay it', riskTier: 'high', payload: {} }]
        : [],
      interruptUser: high,
      rationale: 'stub',
    }
  },
}

/** An Extractor that opens a loop for one thread and turns every other thread down. */
function onlyThread(threadId: string): Specialists['extract'] {
  return async ({ thread }) => {
    const root = thread[0]
    if (!root || root.threadId !== threadId) {
      return { isResponsibility: false, confidence: 0.95, rationale: 'not a responsibility' }
    }
    return {
      isResponsibility: true,
      candidate: {
        title: root.subject,
        category: 'other',
        area: 'other',
        actionType: 'none',
        sourceRef: { sourceType: 'email', sourceId: root.id, threadId: root.threadId },
      },
      confidence: 0.9,
      rationale: 'stub',
    }
  }
}

function cite(
  sourceId: string,
  threadId: string,
  supports: InvestigatorOutput['evidence'][number]['supports'],
): InvestigatorOutput['evidence'][number] {
  return {
    sourceRef: { sourceType: 'email', sourceId, threadId },
    observedAt: now,
    excerpt: `stub excerpt for ${sourceId}`,
    supports,
    confidence: 0.9,
  }
}

/** A promise and the handle that settles it, for stepping two scans through one ledger. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let settle: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, resolve: () => settle() }
}

/** The local ledger with one write replaced, so a thread can be made to die partway through. */
function ledgerThatFails(store: LocalLedgerStore, at: Partial<LedgerStore>): LedgerStore {
  return {
    getLoop: (u, id) => store.getLoop(u, id),
    putLoop: (l, o) => store.putLoop(l, o),
    listLoops: (u, f) => store.listLoops(u, f),
    findLoopsBySource: (u, id) => store.findLoopsBySource(u, id),
    appendEvidence: (e) => store.appendEvidence(e),
    listEvidence: (id) => store.listEvidence(id),
    putAction: (a) => store.putAction(a),
    getAction: (u, id) => store.getAction(u, id),
    listActions: (u, f) => store.listActions(u, f),
    appendAudit: (e) => store.appendAudit(e),
    listAudit: (u, o) => store.listAudit(u, o),
    ...at,
  }
}

describe('runScan', () => {
  it('creates one loop per responsibility thread with evidence, audit and gated actions', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    const summary = await runScan({ source, store, userId: 'u', specialists: stubs, now })

    expect(summary.threads).toBe(12)
    expect(summary.created).toBe(11)
    expect(summary.skipped).toBe(1)

    const loops = await store.listLoops('u')
    const housing = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-housing'))
    expect(housing?.status).toBe('RESOLVED')
    expect(housing?.resolvedAt).toBe(now)
    expect((await store.listEvidence(housing?.id ?? '')).map((e) => e.supports)).toEqual([
      'OPEN',
      'RESOLVED',
    ])

    const issue = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-issue1'))
    expect(issue?.status).toBe('WAITING')
    expect(issue?.owner).toBe('other')
    expect(issue?.waitingOn).toBe('Bill Okafor')

    const deposit = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-deposit'))
    expect(deposit?.priority).toBe('critical')
    // The Risk Judge's interrupt decision reaches the ledger; the web app gates its notification on it.
    expect(deposit?.interruptUser).toBe(true)
    expect(issue?.interruptUser).toBe(false)
    const actions = await store.listActions('u', { loopId: deposit?.id ?? '' })
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      riskTier: 'high',
      requiresApproval: true,
      status: 'PROPOSED',
    })

    const audit = await store.listAudit('u')
    expect(audit.filter((a) => a.kind === 'loop_created')).toHaveLength(11)
    expect(audit.some((a) => a.kind === 'scan_completed')).toBe(true)
  })

  it('delta path: new messages update existing loops instead of duplicating them', async () => {
    const base = (await FixtureSource.load(seed)).fixture
    const delta = (await FixtureSource.load(deltaSeed)).fixture
    const store = new LocalLedgerStore()
    await runScan({
      source: FixtureSource.fromData(base),
      store,
      userId: 'u',
      specialists: stubs,
      now,
    })

    const later = '2026-09-11T13:00:00.000Z'
    const second = await runScan({
      source: FixtureSource.fromDataWithDelta(base, delta),
      store,
      userId: 'u',
      specialists: stubs,
      now: later,
    })
    expect(second).toMatchObject({ threads: 13, created: 1, updated: 2 })

    const loops = await store.listLoops('u')
    expect(loops).toHaveLength(12)
    const deposit = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-deposit'))
    expect(deposit?.status).toBe('RESOLVED')
    expect(deposit?.resolvedAt).toBe(later)
    expect(deposit?.sourceRefs.map((r) => r.sourceId)).toContain('msg-014')
    expect((await store.listEvidence(deposit?.id ?? '')).map((e) => e.sourceId)).toEqual([
      'msg-001',
      'msg-014',
    ])

    // The transition re-opened the question the Risk Judge answered at creation: the deposit was
    // critical and worth interrupting for while it was the user's move, and is neither now.
    expect(deposit?.priority).toBe('medium')
    expect(deposit?.interruptUser).toBe(false)
    expect(deposit?.riskLevel).toBe('low')

    const issue = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-issue1'))
    expect(issue?.status).toBe('RESOLVED')
    const flight = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-flight'))
    expect(flight?.status).toBe('NEEDS_YOU')
    expect((await store.listEvidence(flight?.id ?? '')).map((e) => e.sourceId)).toContain('msg-016')

    const audit = await store.listAudit('u', { loopId: deposit?.id ?? '' })
    expect(audit[0]).toMatchObject({
      kind: 'state_changed',
      details: { from: 'NEEDS_YOU', to: 'RESOLVED' },
    })

    const third = await runScan({
      source: FixtureSource.fromDataWithDelta(base, delta),
      store,
      userId: 'u',
      specialists: stubs,
      now: later,
    })
    expect(third).toMatchObject({ created: 0, updated: 0, skipped: 13 })
  })

  it('lets a later thread resolve a loop it did not open', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    const opening: Specialists = { ...stubs, extract: onlyThread('thr-deposit') }
    await runScan({ source, store, userId: 'u', specialists: opening, now, concurrency: 3 })
    expect(await store.listLoops('u')).toHaveLength(1)

    // The receipt lands in another thread and its investigation points at the mail the loop was
    // opened from, so it closes that loop instead of opening a second one (SPEC \u00a74).
    const receipt: Specialists = {
      ...stubs,
      extract: onlyThread('thr-housing'),
      async investigate({ thread }) {
        return {
          evidence: [
            ...thread.map((m) => cite(m.id, m.threadId, 'RESOLVED')),
            cite('msg-001', 'thr-deposit', 'RESOLVED'),
          ],
          proposedStatus: 'RESOLVED',
          confidence: 0.9,
          rationale: 'stub: the deposit was paid',
        }
      },
    }
    const later = '2026-09-11T13:00:00.000Z'
    await runScan({ source, store, userId: 'u', specialists: receipt, now: later, concurrency: 3 })

    const loops = await store.listLoops('u')
    expect(loops).toHaveLength(1)
    expect(loops[0]).toMatchObject({ status: 'RESOLVED', resolvedAt: later })
    expect(loops[0]?.sourceRefs.map((r) => r.threadId)).toContain('thr-housing')
    const evidence = await store.listEvidence(loops[0]?.id ?? '')
    expect(evidence.filter((e) => e.threadId === 'thr-housing').map((e) => e.sourceId)).toEqual([
      'msg-002',
      'msg-003',
    ])
  })

  it('re-judges a loop that becomes the user\u2019s move, so it can interrupt', async () => {
    const base = (await FixtureSource.load(seed)).fixture
    const delta = (await FixtureSource.load(deltaSeed)).fixture
    const store = new LocalLedgerStore()
    await runScan({
      source: FixtureSource.fromData(base),
      store,
      userId: 'u',
      specialists: stubs,
      now,
    })

    const before = (await store.listLoops('u')).find((l) =>
      l.sourceRefs.some((r) => r.threadId === 'thr-issue1'),
    )
    // Somebody else owed the next move, so nothing about it was worth a tap on the shoulder.
    expect(before).toMatchObject({ status: 'WAITING', priority: 'medium', interruptUser: false })

    // The other party now asks the user for something: Waiting -> Needs You.
    const asking: Specialists = {
      ...stubs,
      async update({ loop, newMessages }) {
        return {
          evidence: newMessages.map((m) => ({
            sourceRef: { sourceType: 'email', sourceId: m.id, threadId: m.threadId },
            observedAt: m.date,
            excerpt: m.snippet,
            supports: 'UPDATED',
            confidence: 0.9,
          })),
          proposedStatus: loop.status === 'WAITING' ? 'NEEDS_YOU' : loop.status,
          confidence: 0.9,
          rationale: 'stub: they came back asking for something',
        }
      },
      async judge({ loop }) {
        const owed = loop.status === 'NEEDS_YOU'
        return {
          riskTier: 'medium',
          priority: owed ? 'high' : 'low',
          consequence: 'stub consequence',
          nextAction: 'stub next action',
          proposedActions: [],
          interruptUser: owed,
          rationale: 'stub',
        }
      },
    }

    await runScan({
      source: FixtureSource.fromDataWithDelta(base, delta),
      store,
      userId: 'u',
      specialists: asking,
      now: '2026-09-11T13:00:00.000Z',
    })

    const after = (await store.listLoops('u')).find((l) =>
      l.sourceRefs.some((r) => r.threadId === 'thr-issue1'),
    )
    expect(after).toMatchObject({ status: 'NEEDS_YOU', priority: 'high', interruptUser: true })
    expect(after?.consequence).toBe('stub consequence')
  })

  it('is idempotent: a second scan skips threads that already produced a loop', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    await runScan({ source, store, userId: 'u', specialists: stubs, now })
    const second = await runScan({ source, store, userId: 'u', specialists: stubs, now })
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(12)
    expect(await store.listLoops('u')).toHaveLength(11)
  })

  it('logs the scan as a pipeline: a line per thread, per role and per outcome', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    const lines: LogLine[] = []
    await runScan({
      source,
      store,
      userId: 'u',
      specialists: stubs,
      now,
      logger: (l) => lines.push(l),
    })

    expect(lines[0]).toMatchObject({ evt: 'scan_started', messages: 15, threads: 12 })
    expect(lines.at(-1)).toMatchObject({ evt: 'scan_completed', created: 11, skipped: 1 })
    expect(typeof lines.at(-1)?.ms).toBe('number')

    // Every role call is timed and attributed to its thread.
    const deposit = lines.filter((l) => l.threadId === 'thr-deposit')
    expect(deposit.map((l) => l.evt)).toEqual([
      'thread_started',
      'role',
      'role',
      'role',
      'loop_created',
    ])
    expect(deposit.filter((l) => l.evt === 'role').map((l) => l.role)).toEqual([
      'extract',
      'investigate',
      'judge',
    ])
    expect(deposit.every((l) => l.evt === 'thread_started' || typeof l.ms === 'number')).toBe(true)
    expect(deposit.at(-1)).toMatchObject({ evt: 'loop_created', status: 'NEEDS_YOU', actions: 1 })

    // No message content reaches the log: the thread id identifies it, the subject does not travel.
    const serialized = JSON.stringify(lines)
    expect(serialized).not.toContain('Action required: Fall registration deposit')
    expect(serialized).not.toContain('Proof of renter')
    expect(serialized).toContain('thr-deposit')

    // A thread the Extractor rejects says why, so the log explains the gap in the ledger.
    expect(
      lines.find((l) => l.threadId === 'thr-newsletter' && l.evt === 'thread_skipped'),
    ).toMatchObject({ reason: 'newsletter' })
  })

  it('refuses a state the loop cannot reach instead of failing the scan', async () => {
    const store = new LocalLedgerStore()
    await store.putLoop(
      OpenLoop.parse({
        id: 'loop-closed',
        userId: 'u',
        title: 'Housing paperwork',
        category: 'other',
        status: 'RESOLVED',
        confidence: 0.9,
        sourceRefs: [{ sourceType: 'email', sourceId: 'msg-002', threadId: 'thr-housing' }],
        createdAt: now,
        updatedAt: now,
        resolvedAt: now,
      }),
    )

    // RESOLVED -> UNCERTAIN is not in the lifecycle table, and the rest of that thread is unseen.
    const unsure: Specialists = {
      ...stubs,
      async update({ newMessages }) {
        return {
          evidence: newMessages.map((m) => ({
            sourceRef: { sourceType: 'email', sourceId: m.id, threadId: m.threadId },
            observedAt: m.date,
            excerpt: m.snippet,
            supports: 'UPDATED',
            confidence: 0.4,
          })),
          proposedStatus: 'UNCERTAIN',
          confidence: 0.4,
          rationale: 'stub: no longer sure where this stands.',
        }
      },
    }
    const summary = await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: unsure,
      now: '2026-09-11T13:00:00.000Z',
    })

    expect(summary).toMatchObject({ created: 10, updated: 0, failed: 0 })
    expect(await store.getLoop('u', 'loop-closed')).toMatchObject({
      status: 'RESOLVED',
      resolvedAt: now,
    })

    // The mail is still recorded; only the state the model asked for is turned down, with a reason.
    expect((await store.listEvidence('loop-closed')).map((e) => e.sourceId)).toEqual(['msg-003'])
    const audit = (await store.listAudit('u', { loopId: 'loop-closed' }))[0]
    expect(audit?.kind).toBe('evidence_added')
    expect(audit?.reason).toContain('RESOLVED -> UNCERTAIN is not a move this loop can make')
  })

  it('finishes the scan when one thread throws, and counts it', async () => {
    const store = new LocalLedgerStore()
    const events: ScanEvent[] = []
    const lines: LogLine[] = []
    const breaking: Specialists = {
      ...stubs,
      async extract(input) {
        if (input.thread[0]?.threadId === 'thr-deposit') throw new Error('stub: the model refused')
        return stubs.extract(input)
      },
    }
    const summary = await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: breaking,
      now,
      concurrency: 3,
      onEvent: (e) => events.push(e),
      logger: (l) => lines.push(l),
    })

    expect(summary).toMatchObject({ threads: 12, created: 10, skipped: 1, failed: 1 })
    const loops = await store.listLoops('u')
    expect(loops).toHaveLength(10)
    expect(loops.some((l) => l.sourceRefs.some((r) => r.threadId === 'thr-deposit'))).toBe(false)
    expect(loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-housing'))?.status).toBe(
      'RESOLVED',
    )

    const audit = await store.listAudit('u')
    expect(audit.find((a) => a.kind === 'scan_completed')).toMatchObject({
      details: { created: 10, failed: 1 },
    })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(lines.find((l) => l.evt === 'thread_failed')).toEqual({
      evt: 'thread_failed',
      threadId: 'thr-deposit',
      error: 'stub: the model refused',
    })
  })

  it('publishes no loop for a thread that dies while writing one', async () => {
    const inner = new LocalLedgerStore()
    const events: ScanEvent[] = []
    const store = ledgerThatFails(inner, {
      async appendEvidence(evidence) {
        if (evidence.threadId === 'thr-deposit') throw new Error('stub: the ledger refused')
        return inner.appendEvidence(evidence)
      },
    })
    const summary = await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
      onEvent: (e) => events.push(e),
    })

    expect(summary).toMatchObject({ threads: 12, created: 10, skipped: 1, failed: 1 })

    // The row is written after the records it hangs from, so the failed thread left nothing behind.
    const loops = await inner.listLoops('u')
    expect(loops).toHaveLength(10)
    expect(loops.some((l) => l.sourceRefs.some((r) => r.threadId === 'thr-deposit'))).toBe(false)
    expect(summary.created).toBe(loops.length)

    // No loop a person can open has an empty evidence panel or an empty history.
    for (const loop of loops) {
      expect((await inner.listEvidence(loop.id)).length).toBeGreaterThan(0)
      expect(await inner.listAudit('u', { loopId: loop.id })).not.toHaveLength(0)
    }

    const audit = await inner.listAudit('u')
    expect(audit.find((a) => a.kind === 'scan_completed')).toMatchObject({
      details: { created: 10, failed: 1 },
    })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('counts a loop that reached the ledger before its thread failed, and says so in its history', async () => {
    const inner = new LocalLedgerStore()
    const store = ledgerThatFails(inner, {
      async putAction() {
        throw new Error('stub: the ledger refused')
      },
    })
    const summary = await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
    })

    // Only the deposit thread proposes an action, and it failed after its row was already visible.
    expect(summary).toMatchObject({ threads: 12, created: 11, skipped: 1, failed: 1 })
    const loops = await inner.listLoops('u')
    expect(loops).toHaveLength(11)
    expect(summary.created).toBe(loops.length)

    const deposit = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-deposit'))
    expect((await inner.listEvidence(deposit?.id ?? '')).length).toBeGreaterThan(0)
    expect(await inner.listActions('u', { loopId: deposit?.id ?? '' })).toHaveLength(0)
    const reasons = (await inner.listAudit('u', { loopId: deposit?.id ?? '' })).map((a) => a.reason)
    expect(reasons.some((r) => r.includes('failed after the loop was opened'))).toBe(true)
  })

  it('gives a thread its own resolved loop rather than one it only cited', async () => {
    const store = new LocalLedgerStore()
    // Both are RESOLVED and both are claimed by thr-housing: one carries the thread, the other was
    // opened elsewhere from a message this thread also contains. Query order puts the cited one
    // first, so only the stated precedence keeps the thread's mail on the thread's own loop.
    const resolved = (id: string, refs: OpenLoop['sourceRefs']) =>
      OpenLoop.parse({
        id,
        userId: 'u',
        title: id,
        category: 'other',
        status: 'RESOLVED',
        confidence: 0.9,
        sourceRefs: refs,
        createdAt: now,
        updatedAt: now,
        resolvedAt: now,
      })
    await store.putLoop(resolved('loop-cited', [{ sourceType: 'email', sourceId: 'msg-002' }]))
    await store.putLoop(
      resolved('loop-own', [{ sourceType: 'email', sourceId: 'msg-003', threadId: 'thr-housing' }]),
    )

    await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: { ...stubs, extract: onlyThread('thr-none') },
      now: '2026-09-11T13:00:00.000Z',
    })

    expect((await store.listEvidence('loop-own')).map((e) => e.sourceId)).toEqual(['msg-002'])
    expect(await store.listEvidence('loop-cited')).toHaveLength(0)
    expect(await store.listLoops('u')).toHaveLength(2)
  })
})

/** Two threads processed at the same time whose investigations cite the same messages: one loop, not two. */
const crossCitingStubs: Specialists = {
  ...stubs,
  async extract({ thread }) {
    const root = thread[0]
    if (!root || (root.threadId !== 'thr-deposit' && root.threadId !== 'thr-flight')) {
      return { isResponsibility: false, confidence: 0.95, rationale: 'not a responsibility' }
    }
    return {
      isResponsibility: true,
      candidate: {
        title: root.subject,
        category: 'other',
        area: 'other',
        actionType: 'none',
        sourceRef: { sourceType: 'email', sourceId: root.id, threadId: root.threadId },
      },
      confidence: 0.9,
      rationale: 'stub',
    }
  },
  async investigate() {
    return {
      evidence: [
        {
          sourceRef: { sourceType: 'email', sourceId: 'msg-001', threadId: 'thr-deposit' },
          observedAt: now,
          excerpt: 'deposit',
          supports: 'OPEN',
          confidence: 0.9,
        },
        {
          sourceRef: { sourceType: 'email', sourceId: 'msg-008', threadId: 'thr-flight' },
          observedAt: now,
          excerpt: 'the flight is part of the same obligation',
          supports: 'OPEN',
          confidence: 0.9,
        },
      ],
      proposedStatus: 'NEEDS_YOU',
      confidence: 0.9,
      rationale: 'stub: cites both threads',
    }
  },
}

/** One investigation quotes a message from a thread it does not own; the quote is not a claim on it. */
const quotingStubs: Specialists = {
  ...stubs,
  async extract({ thread }) {
    const root = thread[0]
    if (!root || (root.threadId !== 'thr-deposit' && root.threadId !== 'thr-housing')) {
      return { isResponsibility: false, confidence: 0.95, rationale: 'not a responsibility' }
    }
    return {
      isResponsibility: true,
      candidate: {
        title: root.subject,
        category: 'other',
        area: 'other',
        actionType: 'none',
        sourceRef: { sourceType: 'email', sourceId: root.id, threadId: root.threadId },
      },
      confidence: 0.9,
      rationale: 'stub',
    }
  },
  async investigate({ thread }) {
    const root = thread[0]
    const own = thread.map((m) => cite(m.id, m.threadId, 'OPEN'))
    return {
      evidence:
        root?.threadId === 'thr-deposit' ? [...own, cite('msg-003', 'thr-housing', 'OPEN')] : own,
      proposedStatus: 'NEEDS_YOU',
      confidence: 0.9,
      rationale: 'stub: the deposit quotes the housing thread',
    }
  },
}

/**
 * The local ledger with a rival writer that lands on one loop just before each of the first
 * `rivals` writes to it, moving its due date — a field the delta path never writes, so whether it
 * survives says whether the rival's write did. Stands in for the web app or a second scan writing
 * the same row while the Investigator is thinking. The rival lands whether or not our write asks
 * for a version check, so the same test tells the two apart.
 */
function ledgerWithRival(inner: LocalLedgerStore, loopId: string, rivals: number) {
  const attempts: string[] = []
  let landed = 0
  const store = ledgerThatFails(inner, {
    async putLoop(l, o) {
      if (l.id !== loopId) return inner.putLoop(l, o)
      attempts.push(l.status)
      if (landed < rivals) {
        landed++
        const current = await inner.getLoop(l.userId, loopId)
        if (current) {
          await inner.putLoop(
            { ...current, dueAt: `2026-09-2${landed}T00:00:00.000Z` },
            { ifUnchanged: true },
          )
        }
      }
      return inner.putLoop(l, o)
    },
  })
  return { store, attempts }
}

describe('runScan under concurrency', () => {
  it('produces the same loops and statuses as the sequential path', async () => {
    const sequentialStore = new LocalLedgerStore()
    const sequential = await runScan({
      source: await FixtureSource.load(seed),
      store: sequentialStore,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 1,
    })
    const concurrentStore = new LocalLedgerStore()
    const concurrent = await runScan({
      source: await FixtureSource.load(seed),
      store: concurrentStore,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
    })

    expect(concurrent).toEqual(sequential)
    expect(concurrent.created).toBe(11)
    const identify = (loops: OpenLoop[]) => loops.map((l) => [l.title, l.status, l.priority]).sort()
    expect(identify(await concurrentStore.listLoops('u'))).toEqual(
      identify(await sequentialStore.listLoops('u')),
    )
  })

  it('creates one loop when two threads in flight claim the same message', async () => {
    const store = new LocalLedgerStore()
    const summary = await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: crossCitingStubs,
      now,
      concurrency: 10,
    })

    expect(summary.created).toBe(1)
    const loops = await store.listLoops('u')
    expect(loops).toHaveLength(1)
    const refs = loops[0]?.sourceRefs.map((r) => r.sourceId) ?? []
    expect(refs).toContain('msg-001')
    expect(refs).toContain('msg-008')
    expect(summary.skipped).toBe(11)
  })

  it('still opens a loop for a thread another investigation only quoted', async () => {
    const store = new LocalLedgerStore()
    const summary = await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: quotingStubs,
      now,
      concurrency: 10,
    })

    expect(summary.created).toBe(2)
    expect(summary.skipped).toBe(10)
    const loops = await store.listLoops('u')
    expect(loops).toHaveLength(2)
    const deposit = loops.find((l) => l.sourceRefs.some((r) => r.sourceId === 'msg-001'))
    const housing = loops.find((l) => l.sourceRefs.some((r) => r.sourceId === 'msg-002'))
    expect(housing?.sourceRefs.map((r) => r.threadId)).toContain('thr-housing')
    // The quote is still evidence on the loop that made it, it just does not own the thread.
    expect((await store.listEvidence(deposit?.id ?? '')).map((e) => e.sourceId)).toContain(
      'msg-003',
    )
  })

  it('keeps the events of one thread adjacent', async () => {
    const store = new LocalLedgerStore()
    const events: ScanEvent[] = []
    await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
      onEvent: (e) => events.push(e),
    })

    let current: string | undefined
    const blocks: string[] = []
    for (const event of events) {
      if (event.type === 'thread') {
        current = event.threadId
        blocks.push(event.threadId)
      } else if (event.type === 'skipped') {
        expect(event.threadId).toBe(current)
      } else if (event.type === 'loop' || event.type === 'updated') {
        expect(event.loop.sourceRefs.map((r) => r.threadId)).toContain(current)
      }
    }
    expect(blocks).toHaveLength(12)
    expect(new Set(blocks).size).toBe(12)
    expect(events.at(-1)?.type).toBe('done')
  })

  it('does not lose an update when two threads land on the same loop', async () => {
    const store = new LocalLedgerStore()
    await store.putLoop(
      OpenLoop.parse({
        id: 'loop-shared',
        userId: 'u',
        title: 'Tracked across two threads',
        category: 'other',
        status: 'NEEDS_YOU',
        confidence: 0.9,
        sourceRefs: [
          { sourceType: 'email', sourceId: 'msg-002', threadId: 'thr-housing' },
          { sourceType: 'email', sourceId: 'msg-008', threadId: 'thr-flight' },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    )
    await runScan({
      source: await FixtureSource.load(seed),
      store,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 10,
    })

    const shared = await store.getLoop('u', 'loop-shared')
    const refs = shared?.sourceRefs.map((r) => r.sourceId) ?? []
    expect(refs).toContain('msg-003')
    expect(refs).toContain('msg-009')
    expect((await store.listEvidence('loop-shared')).map((e) => e.sourceId).sort()).toEqual([
      'msg-003',
      'msg-009',
    ])
  })

  it('delta path: concurrent threads update their own loops', async () => {
    const base = (await FixtureSource.load(seed)).fixture
    const delta = (await FixtureSource.load(deltaSeed)).fixture
    const store = new LocalLedgerStore()
    await runScan({
      source: FixtureSource.fromData(base),
      store,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
    })

    const later = '2026-09-11T13:00:00.000Z'
    const second = await runScan({
      source: FixtureSource.fromDataWithDelta(base, delta),
      store,
      userId: 'u',
      specialists: stubs,
      now: later,
      concurrency: 3,
    })

    expect(second).toMatchObject({ threads: 13, created: 1, updated: 2 })
    const loops = await store.listLoops('u')
    expect(loops).toHaveLength(12)
    const deposit = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-deposit'))
    expect(deposit?.status).toBe('RESOLVED')
    expect(deposit?.resolvedAt).toBe(later)
    expect((await store.listEvidence(deposit?.id ?? '')).map((e) => e.sourceId)).toEqual([
      'msg-001',
      'msg-014',
    ])
  })

  it('delta path: keeps a change made while the update ran, and still transitions the loop', async () => {
    const base = (await FixtureSource.load(seed)).fixture
    const delta = (await FixtureSource.load(deltaSeed)).fixture
    const inner = new LocalLedgerStore()
    await runScan({
      source: FixtureSource.fromData(base),
      store: inner,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
    })
    const depositId =
      (await inner.listLoops('u')).find((l) =>
        l.sourceRefs.some((r) => r.threadId === 'thr-deposit'),
      )?.id ?? ''
    const { store, attempts } = ledgerWithRival(inner, depositId, 1)

    const later = '2026-09-11T13:00:00.000Z'
    const second = await runScan({
      source: FixtureSource.fromDataWithDelta(base, delta),
      store,
      userId: 'u',
      specialists: stubs,
      now: later,
      concurrency: 3,
    })

    // Two writes for one logical update: the first lost the compare-and-swap, the second won.
    expect(attempts).toEqual(['RESOLVED', 'RESOLVED'])
    expect(second).toMatchObject({ created: 1, updated: 2, failed: 0 })
    const deposit = await inner.getLoop('u', depositId)
    expect(deposit?.status).toBe('RESOLVED')
    expect(deposit?.resolvedAt).toBe(later)
    expect(deposit?.dueAt).toBe('2026-09-21T00:00:00.000Z')
    expect((await inner.listEvidence(depositId)).map((e) => e.sourceId)).toEqual([
      'msg-001',
      'msg-014',
    ])
    const trail = await inner.listAudit('u', { loopId: depositId })
    expect(trail.filter((e) => e.kind === 'state_changed')).toHaveLength(1)
  })

  it('delta path: a loop that keeps changing underneath fails its thread, not the scan', async () => {
    const base = (await FixtureSource.load(seed)).fixture
    const delta = (await FixtureSource.load(deltaSeed)).fixture
    const inner = new LocalLedgerStore()
    await runScan({
      source: FixtureSource.fromData(base),
      store: inner,
      userId: 'u',
      specialists: stubs,
      now,
      concurrency: 3,
    })
    const depositId =
      (await inner.listLoops('u')).find((l) =>
        l.sourceRefs.some((r) => r.threadId === 'thr-deposit'),
      )?.id ?? ''
    const { store, attempts } = ledgerWithRival(inner, depositId, 3)
    const lines: LogLine[] = []

    const later = '2026-09-11T13:00:00.000Z'
    const second = await runScan({
      source: FixtureSource.fromDataWithDelta(base, delta),
      store,
      userId: 'u',
      specialists: stubs,
      now: later,
      concurrency: 3,
      logger: (l) => lines.push(l),
    })

    expect(attempts).toHaveLength(3)
    // The rest of the inbox still lands; only this thread is counted lost.
    expect(second).toMatchObject({ threads: 13, created: 1, updated: 1, failed: 1 })
    expect(lines.find((l) => l.evt === 'thread_failed')).toMatchObject({
      threadId: 'thr-deposit',
      error: `loop ${depositId} changed under this update 3 times; its state was not written`,
    })
    const deposit = await inner.getLoop('u', depositId)
    expect(deposit?.status).toBe('NEEDS_YOU')
    expect(deposit?.dueAt).toBe('2026-09-23T00:00:00.000Z')
    const trail = await inner.listAudit('u', { loopId: depositId })
    expect(trail.some((e) => e.kind === 'state_changed')).toBe(false)
  })

  it('does not duplicate a loop another scan wrote while this one was still thinking', async () => {
    // Two scans over one table, which the Scan button and the scheduled catch-up can produce. They
    // share the ledger and nothing else, so the claim decision has to ask the store: a map of what
    // this process claimed is invisible to the other one. The second scan reads the ledger before
    // the first has written anything, then sits in its Extractor until the first has finished.
    const base = (await FixtureSource.load(seed)).fixture
    const oneThread = {
      ...base,
      messages: base.messages.filter((m) => m.threadId === 'thr-housing'),
    }
    const store = new LocalLedgerStore()
    const hasRead = deferred()
    const firstDone = deferred()

    const second = runScan({
      source: FixtureSource.fromData(oneThread),
      store,
      userId: 'u',
      specialists: {
        ...stubs,
        extract: async (input) => {
          hasRead.resolve()
          await firstDone.promise
          return stubs.extract(input)
        },
      },
      now,
    })
    await hasRead.promise
    const first = await runScan({
      source: FixtureSource.fromData(oneThread),
      store,
      userId: 'u',
      specialists: stubs,
      now,
    })
    firstDone.resolve()

    expect(first.created).toBe(1)
    expect(await second).toMatchObject({ created: 0, skipped: 1 })
    expect(await store.listLoops('u')).toHaveLength(1)
  })
})
