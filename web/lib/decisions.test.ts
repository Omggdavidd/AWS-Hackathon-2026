import { LocalLedgerStore, type OpenLoop, type ProposedAction } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import {
  decisionBack,
  decisionHref,
  describeProposal,
  needsDecision,
  pendingDecisions,
  readDecisionOrigin,
} from './decisions'

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
    expect(needsDecision(action('c', { type: 'draft_email' }))).toBe(false)
    expect(needsDecision(action('d', { requiresApproval: true, status: 'APPROVED' }))).toBe(false)
  })

  it('asks the policy gate, so a type no tier makes safe is a decision', () => {
    // A low-risk `pay` passes both of the old tests and is still refused by `mayExecute`, which
    // reads the action type before the tier (#163): before this it fell through Handle into
    // "needs you" and out of the Decisions list, so it was handled by nothing and shown nowhere.
    expect(needsDecision(action('pay', { type: 'pay', riskTier: 'low' }))).toBe(true)
    expect(needsDecision(action('se', { type: 'send_email', riskTier: 'low' }))).toBe(true)
    expect(needsDecision(action('rm', { type: 'remind', riskTier: 'medium' }))).toBe(false)
  })

  it('is false once an action is finished: the gate refuses those too, but nobody is waiting', () => {
    for (const status of ['EXECUTED', 'CANCELLED', 'FAILED'] as const)
      expect(needsDecision(action(status, { type: 'follow_up', status }))).toBe(false)
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
    await store.putAction(action('auto', { type: 'draft_email' }))
    const decisions = await pendingDecisions(store, 'u')
    expect(decisions.map((d) => d.action.id)).toEqual(['new', 'old'])
    expect(decisions[0]?.loop?.title).toBe('loop-a')
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

describe('decision origin', () => {
  it('sends Back from a Review opened on a responsibility to that responsibility in its list', () => {
    const href = decisionHref('act-1', { from: 'loop', loopId: 'loop-insurance' })
    expect(href).toBe('/decisions?action=act-1&loop=loop-insurance')
    const origin = readDecisionOrigin(Object.fromEntries(new URL(href, 'http://x').searchParams))
    expect(decisionBack(origin)).toEqual({
      href: '/?loop=loop-insurance',
      label: 'Back to responsibilities',
    })
  })

  it('sends Back from Today to the list, and from Decisions to Decisions', () => {
    expect(decisionHref('act-1', { from: 'today' })).toBe('/decisions?action=act-1&from=today')
    expect(decisionBack(readDecisionOrigin({ from: 'today' })).href).toBe('/?view=list')
    expect(decisionHref('act-1', { from: 'decisions' })).toBe('/decisions?action=act-1')
    expect(decisionBack(readDecisionOrigin({})).href).toBe('/decisions')
  })

  it('ignores a loop id that is not a plain id instead of linking to it', () => {
    for (const loop of ['javascript:alert(1)//x y', '../x/y', ['loop-a'], ''])
      expect(readDecisionOrigin({ loop })).toEqual({ from: 'decisions' })
  })
})
