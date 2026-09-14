import { describe, expect, it } from 'vitest'
import { auditEvent, evidenceFromInvestigator, type InvestigatorOutput } from '../src/index'

const now = '2026-09-10T13:00:00.000Z'

const observation = (
  overrides: Partial<InvestigatorOutput['evidence'][number]> = {},
): InvestigatorOutput['evidence'][number] => ({
  sourceRef: { sourceType: 'email', sourceId: 'msg-002', threadId: 'thr-housing' },
  observedAt: '2026-09-08T09:12:00-04:00',
  excerpt: 'Proof of renter’s insurance is needed before move-in.',
  supports: 'OPEN',
  confidence: 0.9,
  ...overrides,
})

describe('auditEvent', () => {
  it('builds the row a scan writes when a loop opens', () => {
    expect(
      auditEvent({
        id: 'aud-1',
        userId: 'user-1',
        loopId: 'loop-1',
        at: now,
        kind: 'loop_created',
        actor: 'agent',
        reason: 'The message names an amount and a deadline.',
      }),
    ).toEqual({
      id: 'aud-1',
      userId: 'user-1',
      loopId: 'loop-1',
      at: now,
      kind: 'loop_created',
      actor: 'agent',
      reason: 'The message names an amount and a deadline.',
    })
  })

  it('carries the action and the details when they are given', () => {
    const event = auditEvent({
      id: 'aud-2',
      userId: 'user-1',
      loopId: 'loop-1',
      actionId: 'act-1',
      at: now,
      kind: 'action_executed',
      actor: 'user',
      reason: 'Approved by the user.',
      details: { since: now, changes: 3 },
    })
    expect(event.actionId).toBe('act-1')
    expect(event.details).toEqual({ since: now, changes: 3 })
  })

  it('leaves out a loop and an action it was not given', () => {
    const event = auditEvent({
      id: 'aud-3',
      userId: 'user-1',
      loopId: undefined,
      at: now,
      kind: 'scan_completed',
      actor: 'agent',
      reason: '12 threads, 11 loops.',
    })
    expect('loopId' in event).toBe(false)
    expect('actionId' in event).toBe(false)
    expect('details' in event).toBe(false)
  })

  it('cuts a reason the model wrote too long down to the 500 the schema allows', () => {
    const event = auditEvent({
      id: 'aud-4',
      userId: 'user-1',
      at: now,
      kind: 'state_changed',
      actor: 'agent',
      reason: 'x'.repeat(900),
    })
    expect(event.reason).toHaveLength(500)
  })

  it('refuses a row the schema does not recognise', () => {
    expect(() =>
      auditEvent({
        id: 'aud-5',
        userId: 'user-1',
        at: 'yesterday',
        kind: 'state_changed',
        actor: 'agent',
        reason: 'The deadline moved.',
      }),
    ).toThrow()
  })
})

describe('evidenceFromInvestigator', () => {
  it('spreads the source the model nested into a stored row', () => {
    expect(evidenceFromInvestigator('ev-1', 'loop-1', observation())).toEqual({
      id: 'ev-1',
      loopId: 'loop-1',
      sourceType: 'email',
      sourceId: 'msg-002',
      threadId: 'thr-housing',
      observedAt: '2026-09-08T09:12:00-04:00',
      excerpt: 'Proof of renter’s insurance is needed before move-in.',
      supports: 'OPEN',
      confidence: 0.9,
    })
  })

  it('leaves out a thread the observation does not name', () => {
    const row = evidenceFromInvestigator('ev-2', 'loop-1', {
      ...observation(),
      sourceRef: { sourceType: 'calendar', sourceId: 'evt-001' },
    })
    expect('threadId' in row).toBe(false)
    expect(row.sourceType).toBe('calendar')
  })

  it('refuses an observation the schema does not recognise', () => {
    expect(() =>
      evidenceFromInvestigator('ev-3', 'loop-1', observation({ confidence: 1.4 })),
    ).toThrow()
  })
})
