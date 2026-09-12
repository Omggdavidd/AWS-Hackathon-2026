import { fileURLToPath } from 'node:url'
import { FixtureSource, LocalLedgerStore } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import type { Specialists } from '../src/agents'
import type { LogLine } from '../src/log'
import { runScan } from '../src/scan'

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
  async judge({ loop }) {
    const high = loop.actionType === 'pay'
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
