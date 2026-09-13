import { LocalLedgerStore, type OpenLoop, type ProposedAction } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { describeProposal, needsDecision, pendingDecisions } from './decisions'

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

describe('describeProposal', () => {
  it('renders an email draft as an email', () => {
    const p = describeProposal(
      action('a', {
        type: 'draft_email',
        payload: { to: 'x@y.z', subject: 'Re: hi', body: 'Hello' },
      }),
    )
    expect(p).toEqual({ kind: 'email', to: 'x@y.z', subject: 'Re: hi', body: 'Hello' })
  })
  it('renders a payment with its amount and portal', () => {
    const p = describeProposal(
      action('b', {
        type: 'pay',
        payload: { amount: 200, currency: 'USD', portal: 'Student Accounts' },
      }),
    )
    expect(p).toEqual({ kind: 'payment', amount: '$200.00', portal: 'Student Accounts' })
  })
  it('renders a booking as a choice between slots', () => {
    const p = describeProposal(
      action('c', {
        type: 'book_appointment',
        payload: { candidates: ['Tue 2:00 PM', 'Fri 4:15 PM'], conflictFree: ['Fri 4:15 PM'] },
      }),
    )
    expect(p).toEqual({
      kind: 'choice',
      options: ['Tue 2:00 PM', 'Fri 4:15 PM'],
      free: ['Fri 4:15 PM'],
    })
  })
  it('falls back to labelled fields and hides nothing but the executed effect', () => {
    const p = describeProposal(
      action('d', {
        type: 'follow_up',
        payload: { after: '2026-09-11', effect: { kind: 'note' } },
      }),
    )
    expect(p).toEqual({ kind: 'fields', fields: [{ label: 'After', value: '2026-09-11' }] })
    expect(describeProposal(action('e', { type: 'other', payload: {} }))).toBeUndefined()
  })
})
