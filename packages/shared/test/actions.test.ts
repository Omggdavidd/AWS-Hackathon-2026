import { describe, expect, it } from 'vitest'
import { FixtureActionSink, isAutoExecutable, mayExecute, type ProposedAction } from '../src/index'

const base: ProposedAction = {
  id: 'a1',
  loopId: 'l1',
  userId: 'u',
  type: 'draft_email',
  riskTier: 'medium',
  requiresApproval: false,
  summary: 'Draft reply',
  payload: {},
  status: 'PROPOSED',
  createdAt: '2026-09-10T00:00:00.000Z',
}

describe('action policy (ADR-0005)', () => {
  it('auto-executes low risk and prepare-type medium risk, never high risk', () => {
    expect(isAutoExecutable({ ...base, riskTier: 'low', type: 'archive_thread' })).toBe(true)
    expect(isAutoExecutable(base)).toBe(true)
    expect(isAutoExecutable({ ...base, type: 'send_email' })).toBe(false)
    expect(
      isAutoExecutable({ ...base, riskTier: 'high', type: 'pay', requiresApproval: true }),
    ).toBe(false)
  })

  // The tier is a field the Risk Judge writes and `requiresApproval` is derived from it, so a model
  // that called a payment low risk used to buy itself a free pass past both. The type decides.
  it.each(['pay', 'submit_form', 'send_email', 'book_appointment', 'other'] as const)(
    'never executes %s alone, whatever tier it carries',
    (type) => {
      for (const riskTier of ['low', 'medium'] as const) {
        expect(isAutoExecutable({ ...base, type, riskTier }), riskTier).toBe(false)
        expect(mayExecute({ ...base, type, riskTier }), riskTier).toEqual({
          ok: false,
          reason: 'requires your approval',
        })
      }
      // A person approving it is still the way through.
      expect(mayExecute({ ...base, type, riskTier: 'low', status: 'APPROVED' })).toEqual({
        ok: true,
      })
    },
  )

  it('still lets the preparing types through at the tier they had', () => {
    for (const type of ['draft_email', 'create_calendar_event', 'remind', 'follow_up'] as const) {
      expect(isAutoExecutable({ ...base, type, riskTier: 'low' }), type).toBe(true)
      expect(isAutoExecutable({ ...base, type, riskTier: 'medium' }), type).toBe(true)
      expect(isAutoExecutable({ ...base, type, riskTier: 'high' }), type).toBe(false)
    }
    expect(isAutoExecutable({ ...base, type: 'archive_thread', riskTier: 'low' })).toBe(true)
    expect(isAutoExecutable({ ...base, type: 'archive_thread', riskTier: 'medium' })).toBe(false)
  })

  it('gates execution on approval for high risk and on status for the rest', () => {
    expect(mayExecute(base)).toEqual({ ok: true })
    expect(
      mayExecute({ ...base, riskTier: 'high', type: 'pay', requiresApproval: true }),
    ).toMatchObject({ ok: false })
    expect(
      mayExecute({
        ...base,
        riskTier: 'high',
        type: 'pay',
        requiresApproval: true,
        status: 'APPROVED',
      }),
    ).toEqual({ ok: true })
    expect(mayExecute({ ...base, status: 'EXECUTED' })).toMatchObject({
      ok: false,
      reason: 'already executed',
    })
    expect(mayExecute({ ...base, status: 'CANCELLED' })).toMatchObject({ ok: false })
  })
})

describe('FixtureActionSink', () => {
  it('records the effect and returns a synthetic source ref', async () => {
    const sink = new FixtureActionSink()
    const result = await sink.execute(base, {
      effect: {
        kind: 'draft_email',
        to: 'office@example.com',
        subject: 'Re: insurance',
        body: 'Attached.',
      },
      summary: 'Draft the reply',
    })
    expect(result.success).toBe(true)
    expect(result.summary).toContain('office@example.com')
    expect(result.resultSourceRef).toEqual({ sourceType: 'agent', sourceId: 'action:a1' })
    expect(sink.log).toHaveLength(1)
  })
})
