import { fileURLToPath } from 'node:url'
import { FixtureSource, LocalLedgerStore } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import type { Specialists } from '../src/agents'
import { runScan } from '../src/scan'

const seed = fileURLToPath(new URL('../../../../demo/seed-inbox.json', import.meta.url))
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

    expect(summary.threads).toBe(10)
    expect(summary.created).toBe(9)
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
    expect(audit.filter((a) => a.kind === 'loop_created')).toHaveLength(9)
    expect(audit.some((a) => a.kind === 'scan_completed')).toBe(true)
  })

  it('is idempotent: a second scan skips threads that already produced a loop', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    await runScan({ source, store, userId: 'u', specialists: stubs, now })
    const second = await runScan({ source, store, userId: 'u', specialists: stubs, now })
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(10)
    expect(await store.listLoops('u')).toHaveLength(9)
  })
})
