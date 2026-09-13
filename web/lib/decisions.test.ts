import { LocalLedgerStore, type OpenLoop, type ProposedAction } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { needsDecision, pendingDecisions } from './decisions'

const now = '2026-09-13T12:00:00.000Z'

function loop(id: string): OpenLoop {
  return {
    id,
    userId: 'u',
    title: id,
    status: 'NEEDS_YOU',
    owner: 'user',
    category: 'payment',
    area: 'money',
    actionType: 'pay',
    riskLevel: 'high',
    priority: 'critical',
    interruptUser: true,
    confidence: 0.9,
    sourceRefs: [{ sourceType: 'email', sourceId: 'msg-001' }],
    createdAt: now,
    updatedAt: now,
  }
}

function action(id: string, over: Partial<ProposedAction>): ProposedAction {
  return {
    id,
    loopId: 'loop-a',
    userId: 'u',
    type: 'pay',
    riskTier: 'low',
    requiresApproval: false,
    summary: id,
    payload: {},
    status: 'PROPOSED',
    createdAt: now,
    ...over,
  }
}

describe('needsDecision', () => {
  it('is true for a gated or high-risk proposal and false otherwise', () => {
    expect(needsDecision(action('a', { requiresApproval: true }))).toBe(true)
    expect(needsDecision(action('b', { riskTier: 'high' }))).toBe(true)
    expect(needsDecision(action('c', {}))).toBe(false)
    expect(needsDecision(action('d', { requiresApproval: true, status: 'APPROVED' }))).toBe(false)
  })
})

describe('pendingDecisions', () => {
  it('joins each gated proposal to its loop, newest first', async () => {
    const store = new LocalLedgerStore()
    await store.putLoop(loop('loop-a'))
    await store.putAction(
      action('old', { requiresApproval: true, createdAt: '2026-09-12T00:00:00.000Z' }),
    )
    await store.putAction(action('new', { riskTier: 'high' }))
    await store.putAction(action('auto', {}))
    const decisions = await pendingDecisions(store, 'u')
    expect(decisions.map((d) => d.action.id)).toEqual(['new', 'old'])
    expect(decisions[0].loop?.title).toBe('loop-a')
  })
})
