import { describe, expect, it } from 'vitest'
import type { AuditEvent, Evidence, LedgerStore, OpenLoop, ProposedAction } from '../src/index'

const now = '2026-09-10T13:00:00.000Z'

export function loop(overrides: Partial<OpenLoop> = {}): OpenLoop {
  return {
    id: 'loop-1',
    userId: 'user-1',
    title: 'Pay registration deposit',
    category: 'payment',
    status: 'NEEDS_YOU',
    owner: 'user',
    actionType: 'pay',
    riskLevel: 'high',
    priority: 'critical',
    confidence: 0.86,
    sourceRefs: [{ sourceType: 'email', sourceId: 'msg-001', threadId: 'thr-deposit' }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Every LedgerStore implementation runs this suite (ADR-0004). */
export function runStoreContract(name: string, make: () => Promise<LedgerStore>) {
  describe(`LedgerStore contract: ${name}`, () => {
    it('stores and scopes loops by user', async () => {
      const store = await make()
      await store.putLoop(loop())
      await store.putLoop(loop({ id: 'loop-2', userId: 'user-2' }))
      expect(await store.getLoop('user-1', 'loop-1')).toMatchObject({ id: 'loop-1' })
      expect(await store.getLoop('user-2', 'loop-1')).toBeUndefined()
      expect(await store.listLoops('user-1')).toHaveLength(1)
    })

    it('filters loops by status and orders by due date', async () => {
      const store = await make()
      await store.putLoop(loop({ id: 'a', status: 'WAITING', dueAt: '2026-09-20T00:00:00.000Z' }))
      await store.putLoop(loop({ id: 'b', status: 'NEEDS_YOU', dueAt: '2026-09-12T00:00:00.000Z' }))
      await store.putLoop(loop({ id: 'c', status: 'NEEDS_YOU' }))
      const needs = await store.listLoops('user-1', { status: 'NEEDS_YOU' })
      expect(needs.map((l) => l.id)).toEqual(['b', 'c'])
      const both = await store.listLoops('user-1', { status: ['NEEDS_YOU', 'WAITING'] })
      expect(both.map((l) => l.id)).toEqual(['b', 'a', 'c'])
    })

    it('finds loops by source id for deduplication', async () => {
      const store = await make()
      await store.putLoop(loop())
      expect(await store.findLoopsBySource('user-1', 'msg-001')).toHaveLength(1)
      expect(await store.findLoopsBySource('user-1', 'msg-999')).toHaveLength(0)
    })

    it('overwrites a loop on put with the same id', async () => {
      const store = await make()
      await store.putLoop(loop())
      await store.putLoop(loop({ status: 'RESOLVED', resolvedAt: now }))
      expect((await store.listLoops('user-1'))[0]?.status).toBe('RESOLVED')
    })

    it('appends and lists evidence per loop in observed order', async () => {
      const store = await make()
      const ev = (id: string, observedAt: string): Evidence => ({
        id,
        loopId: 'loop-1',
        sourceType: 'email',
        sourceId: id,
        observedAt,
        excerpt: 'x',
        supports: 'OPEN',
        confidence: 0.9,
      })
      await store.appendEvidence(ev('e2', '2026-09-03T00:00:00.000Z'))
      await store.appendEvidence(ev('e1', '2026-08-14T00:00:00.000Z'))
      expect((await store.listEvidence('loop-1')).map((e) => e.id)).toEqual(['e1', 'e2'])
      expect(await store.listEvidence('other')).toEqual([])
    })

    it('stores actions and filters by loop and status', async () => {
      const store = await make()
      const act = (
        id: string,
        status: ProposedAction['status'],
        loopId = 'loop-1',
      ): ProposedAction => ({
        id,
        loopId,
        userId: 'user-1',
        type: 'draft_email',
        riskTier: 'medium',
        requiresApproval: false,
        summary: 'Draft reply',
        payload: {},
        status,
        createdAt: now,
      })
      await store.putAction(act('a1', 'PROPOSED'))
      await store.putAction(act('a2', 'APPROVED'))
      await store.putAction(act('a3', 'PROPOSED', 'loop-2'))
      expect(await store.getAction('user-1', 'a1')).toMatchObject({ id: 'a1' })
      expect(await store.getAction('user-9', 'a1')).toBeUndefined()
      expect((await store.listActions('user-1', { status: 'PROPOSED' })).map((a) => a.id)).toEqual([
        'a1',
        'a3',
      ])
      expect((await store.listActions('user-1', { loopId: 'loop-1' })).map((a) => a.id)).toEqual([
        'a1',
        'a2',
      ])
    })

    it('lists audit events newest first with a limit', async () => {
      const store = await make()
      const ev = (id: string, at: string, loopId?: string): AuditEvent => ({
        id,
        userId: 'user-1',
        at,
        kind: 'state_changed',
        actor: 'agent',
        reason: 'test',
        ...(loopId ? { loopId } : {}),
      })
      await store.appendAudit(ev('x1', '2026-09-01T00:00:00.000Z', 'loop-1'))
      await store.appendAudit(ev('x2', '2026-09-02T00:00:00.000Z'))
      await store.appendAudit(ev('x3', '2026-09-03T00:00:00.000Z', 'loop-1'))
      expect((await store.listAudit('user-1')).map((e) => e.id)).toEqual(['x3', 'x2', 'x1'])
      expect((await store.listAudit('user-1', { limit: 1 })).map((e) => e.id)).toEqual(['x3'])
      expect((await store.listAudit('user-1', { loopId: 'loop-1' })).map((e) => e.id)).toEqual([
        'x3',
        'x1',
      ])
    })
  })
}
