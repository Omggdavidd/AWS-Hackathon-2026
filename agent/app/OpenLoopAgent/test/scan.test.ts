import { fileURLToPath } from 'node:url'
import {
  FixtureSource,
  type InvestigatorOutput,
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
})
