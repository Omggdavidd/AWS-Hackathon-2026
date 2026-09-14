import { describe, expect, it } from 'vitest'
import {
  ActionPlan,
  ActionResult,
  CatchUpSummary,
  Confidence,
  ExtractorOutput,
  InvestigatorOutput,
  Money,
  OpenLoop,
  ProposedAction,
  RiskJudgment,
} from '../src/index'
import { loop } from './store-contract'

const now = '2026-09-10T13:00:00.000Z'
const later = '2026-09-11T13:00:00.000Z'
const longer = (limit: number) => 'x'.repeat(limit + 1)

const action = (overrides: Record<string, unknown> = {}) => ({
  id: 'act-1',
  loopId: 'loop-1',
  userId: 'user-1',
  type: 'pay',
  riskTier: 'high',
  requiresApproval: true,
  summary: 'Pay the $200 housing deposit',
  status: 'PROPOSED',
  createdAt: now,
  ...overrides,
})

describe('OpenLoop invariants', () => {
  it('rejects a resolved loop that never says when it closed', () => {
    expect(() => OpenLoop.parse(loop({ status: 'RESOLVED' }))).toThrow(
      /a RESOLVED loop must carry resolvedAt/,
    )
  })

  it('accepts a resolved loop that carries resolvedAt', () => {
    expect(OpenLoop.parse(loop({ status: 'RESOLVED', resolvedAt: later })).resolvedAt).toBe(later)
  })

  it('rejects a loop closed before it was created', () => {
    const born = loop({ createdAt: later, updatedAt: later })
    expect(() => OpenLoop.parse({ ...born, status: 'RESOLVED', resolvedAt: now })).toThrow(
      /resolvedAt cannot precede createdAt/,
    )
  })

  it('accepts a loop closed in the same instant it was created', () => {
    expect(() =>
      OpenLoop.parse(loop({ status: 'RESOLVED', resolvedAt: loop().createdAt })),
    ).not.toThrow()
  })
})

describe('ProposedAction invariants', () => {
  it('rejects a high-risk action that claims it needs no approval', () => {
    expect(() => ProposedAction.parse(action({ requiresApproval: false }))).toThrow(
      /a high-risk action always requires approval/,
    )
  })

  it('lets a medium-risk action run without approval', () => {
    const parsed = ProposedAction.parse(
      action({ type: 'draft_email', riskTier: 'medium', requiresApproval: false }),
    )
    expect(parsed.requiresApproval).toBe(false)
  })
})

describe('Money', () => {
  it('rejects a negative amount', () => {
    expect(() => Money.parse({ value: -1 })).toThrow()
  })

  it('accepts a zero amount', () => {
    expect(Money.parse({ value: 0 }).value).toBe(0)
  })
})

describe('Confidence', () => {
  it('rejects a value outside 0 to 1', () => {
    expect(() => Confidence.parse(1.2)).toThrow()
    expect(() => Confidence.parse(-0.1)).toThrow()
  })

  it('accepts both ends of the range', () => {
    expect(Confidence.parse(0)).toBe(0)
    expect(Confidence.parse(1)).toBe(1)
  })
})

describe('schema defaults', () => {
  it('gives a loop an area, an owner, an action type and no interruption', () => {
    const parsed = OpenLoop.parse({
      id: 'loop-1',
      userId: 'user-1',
      title: 'Return the jacket',
      category: 'purchase',
      status: 'NEEDS_YOU',
      confidence: 0.8,
      sourceRefs: [{ sourceType: 'email', sourceId: 'msg-010' }],
      createdAt: now,
      updatedAt: now,
    })
    expect(parsed.area).toBe('other')
    expect(parsed.owner).toBe('user')
    expect(parsed.actionType).toBe('none')
    expect(parsed.interruptUser).toBe(false)
    expect(parsed.riskLevel).toBe('low')
    expect(parsed.priority).toBe('medium')
  })

  it('gives a proposed action an empty payload', () => {
    expect(ProposedAction.parse(action()).payload).toEqual({})
  })

  it('gives money a currency of USD', () => {
    expect(Money.parse({ value: 15.99 }).currency).toBe('USD')
  })

  it('gives a judgment an empty list of proposed actions', () => {
    const parsed = RiskJudgment.parse({
      riskTier: 'low',
      priority: 'low',
      consequence: 'Nothing happens.',
      nextAction: 'Wait for the reply.',
      interruptUser: false,
      rationale: 'Someone else owes the next move.',
    })
    expect(parsed.proposedActions).toEqual([])
  })
})

describe('ExtractorOutput', () => {
  const extracted = {
    isResponsibility: true,
    candidate: {
      title: 'Pay the $200 housing deposit',
      category: 'payment',
      area: 'school',
      actionType: 'pay',
      requestedBy: 'Student Accounts',
      dueAt: '2026-09-15T03:59:00-04:00',
      amount: { value: 200, currency: 'USD' },
      consequence: 'The room hold is released.',
      sourceRef: { sourceType: 'email', sourceId: 'msg-001', threadId: 'thr-deposit' },
    },
    confidence: 0.92,
    rationale: 'The message names an amount, a portal and a deadline.',
  }

  it('accepts a candidate with an amount, a deadline and its source', () => {
    expect(ExtractorOutput.parse(extracted).candidate?.amount?.value).toBe(200)
  })

  it('accepts a message that creates no responsibility', () => {
    const parsed = ExtractorOutput.parse({
      isResponsibility: false,
      confidence: 0.97,
      rationale: 'A newsletter asks nothing of anyone.',
    })
    expect(parsed.candidate).toBeUndefined()
  })

  it('rejects a title past 120 characters', () => {
    const candidate = { ...extracted.candidate, title: longer(120) }
    expect(() => ExtractorOutput.parse({ ...extracted, candidate })).toThrow()
  })

  it('rejects a rationale past 300 characters', () => {
    expect(() => ExtractorOutput.parse({ ...extracted, rationale: longer(300) })).toThrow()
  })

  it('rejects a confidence above 1', () => {
    expect(() => ExtractorOutput.parse({ ...extracted, confidence: 1.5 })).toThrow()
  })
})

describe('InvestigatorOutput', () => {
  const investigated = {
    evidence: [
      {
        sourceRef: { sourceType: 'email', sourceId: 'msg-002', threadId: 'thr-housing' },
        observedAt: '2026-09-08T09:12:00-04:00',
        excerpt: 'Proof of renter’s insurance is needed before move-in.',
        supports: 'OPEN',
        confidence: 0.9,
      },
    ],
    proposedStatus: 'NEEDS_YOU',
    waitingOn: 'Maple Court Property Management',
    confidence: 0.88,
    rationale: 'Nothing in the thread answers the request.',
  }

  it('accepts an evidence bundle and the state it proposes', () => {
    const parsed = InvestigatorOutput.parse(investigated)
    expect(parsed.evidence[0]?.sourceRef.sourceId).toBe('msg-002')
    expect(parsed.proposedStatus).toBe('NEEDS_YOU')
  })

  it('accepts an empty evidence bundle', () => {
    expect(InvestigatorOutput.parse({ ...investigated, evidence: [] }).evidence).toEqual([])
  })

  it('rejects an excerpt past 500 characters', () => {
    const evidence = [{ ...investigated.evidence[0], excerpt: longer(500) }]
    expect(() => InvestigatorOutput.parse({ ...investigated, evidence })).toThrow()
  })

  it('rejects a status outside the lifecycle', () => {
    expect(() => InvestigatorOutput.parse({ ...investigated, proposedStatus: 'DONE' })).toThrow()
  })
})

describe('RiskJudgment', () => {
  const judged = {
    riskTier: 'high',
    priority: 'critical',
    consequence: 'The room hold is released and the deposit rises by $75.',
    nextAction: 'Pay $200 in the Student Accounts portal.',
    proposedActions: [
      { type: 'pay', summary: 'Pay the $200 deposit', riskTier: 'high' },
      {
        type: 'remind',
        summary: 'Remind me tomorrow morning',
        riskTier: 'low',
        payload: { at: now },
      },
    ],
    interruptUser: true,
    rationale: 'Money leaves the account and the deadline is inside two days.',
  }

  it('accepts a judgment with the actions it would take', () => {
    const parsed = RiskJudgment.parse(judged)
    expect(parsed.proposedActions).toHaveLength(2)
    expect(parsed.proposedActions[0]?.payload).toEqual({})
    expect(parsed.proposedActions[1]?.payload).toEqual({ at: now })
  })

  it('rejects a consequence past 200 characters', () => {
    expect(() => RiskJudgment.parse({ ...judged, consequence: longer(200) })).toThrow()
  })

  it('rejects a next action past 200 characters', () => {
    expect(() => RiskJudgment.parse({ ...judged, nextAction: longer(200) })).toThrow()
  })

  it('rejects an action type no sink knows', () => {
    const proposedActions = [{ type: 'wire_transfer', summary: 'Wire it', riskTier: 'high' }]
    expect(() => RiskJudgment.parse({ ...judged, proposedActions })).toThrow()
  })
})

describe('ActionPlan', () => {
  it('accepts a drafted email', () => {
    const parsed = ActionPlan.parse({
      effect: {
        kind: 'draft_email',
        to: 'office@maplecourtpm.com',
        subject: "Re: Proof of renter's insurance",
        body: 'Please find the certificate attached.',
      },
      summary: 'Draft the reply with the certificate',
      loopStatusAfter: 'WAITING',
    })
    expect(parsed.effect.kind).toBe('draft_email')
    expect(parsed.loopStatusAfter).toBe('WAITING')
  })

  it('rejects an effect kind the union does not name', () => {
    expect(() =>
      ActionPlan.parse({ effect: { kind: 'wire_transfer', amount: 200 }, summary: 'Send it' }),
    ).toThrow()
  })

  it('rejects a calendar effect that ends before it starts', () => {
    expect(() =>
      ActionPlan.parse({
        effect: { kind: 'calendar_event', title: 'Robotics club', start: later, end: now },
        summary: 'Move the club meeting',
      }),
    ).toThrow(/end cannot precede start/)
  })

  it('accepts a calendar effect that ends when it starts', () => {
    expect(() =>
      ActionPlan.parse({
        effect: { kind: 'calendar_event', title: 'Robotics club', start: now, end: now },
        summary: 'Hold the slot',
      }),
    ).not.toThrow()
  })

  it('rejects a body past 4000 characters', () => {
    expect(() =>
      ActionPlan.parse({
        effect: { kind: 'send_email', to: 'a@b.com', subject: 'Hi', body: longer(4000) },
        summary: 'Send it',
      }),
    ).toThrow()
  })
})

describe('ActionResult', () => {
  it('accepts a success with the source it produced', () => {
    const parsed = ActionResult.parse({
      success: true,
      summary: 'Drafted a reply to Maple Court.',
      resultSourceRef: { sourceType: 'email', sourceId: 'draft-001' },
    })
    expect(parsed.resultSourceRef?.sourceId).toBe('draft-001')
  })

  it('accepts a failure with its error', () => {
    const parsed = ActionResult.parse({
      success: false,
      summary: 'The portal refused the payment.',
      error: 'gateway timeout',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an error past 500 characters', () => {
    expect(() =>
      ActionResult.parse({ success: false, summary: 'Failed.', error: longer(500) }),
    ).toThrow()
  })
})

describe('CatchUpSummary', () => {
  const item = (n: number) => ({
    loopId: `loop-${n}`,
    title: `Loop ${n}`,
    kind: 'fyi',
    text: 'Nothing changed overnight.',
  })

  it('accepts a summary of eight changes', () => {
    const parsed = CatchUpSummary.parse({
      headline: 'Two things resolved themselves and one needs you.',
      items: Array.from({ length: 8 }, (_, i) => item(i)),
      nothingElse: true,
    })
    expect(parsed.items).toHaveLength(8)
  })

  it('rejects a ninth item', () => {
    expect(() =>
      CatchUpSummary.parse({
        headline: 'Too much to say.',
        items: Array.from({ length: 9 }, (_, i) => item(i)),
        nothingElse: false,
      }),
    ).toThrow()
  })

  it('rejects an item text past 200 characters', () => {
    expect(() =>
      CatchUpSummary.parse({
        headline: 'One change.',
        items: [{ ...item(1), text: longer(200) }],
        nothingElse: true,
      }),
    ).toThrow()
  })
})
