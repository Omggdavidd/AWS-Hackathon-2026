import type { AuditEvent, ProposedAction } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { parseEffect, terminalReason } from './effects'

const base: ProposedAction = {
  id: 'a1',
  loopId: 'l1',
  userId: 'u',
  type: 'draft_email',
  riskTier: 'medium',
  requiresApproval: false,
  summary: 'Draft',
  payload: {},
  status: 'EXECUTED',
  createdAt: '2026-09-10T00:00:00.000Z',
}

describe('parseEffect', () => {
  it('returns a typed effect when the payload carries one', () => {
    const effect = parseEffect({
      ...base,
      payload: { effect: { kind: 'draft_email', to: 'a@b.c', subject: 'Hi', body: 'Hello' } },
    })
    expect(effect?.kind).toBe('draft_email')
  })
  it('returns undefined for missing or malformed effects', () => {
    expect(parseEffect(base)).toBeUndefined()
    expect(parseEffect({ ...base, payload: { effect: { kind: 'nope' } } })).toBeUndefined()
  })
})

describe('terminalReason', () => {
  const audit: AuditEvent[] = [
    {
      id: 'e1',
      userId: 'u',
      actionId: 'a1',
      at: '2026-09-11T00:00:00.000Z',
      kind: 'action_cancelled',
      actor: 'agent',
      reason: 'Loop already resolved; nothing to do',
    },
  ]
  it('finds the audit reason for a cancelled action', () => {
    expect(terminalReason({ ...base, status: 'CANCELLED' }, audit)).toBe(
      'Loop already resolved; nothing to do',
    )
  })
  it('falls back to the stored error for a failed action', () => {
    expect(terminalReason({ ...base, status: 'FAILED', error: 'sink down' }, [])).toBe('sink down')
  })
  it('is undefined for live actions', () => {
    expect(terminalReason(base, audit)).toBeUndefined()
  })
})
