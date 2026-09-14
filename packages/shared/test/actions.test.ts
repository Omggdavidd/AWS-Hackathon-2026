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

  // The Risk Judge assigns the tier, so the tier is model output. These five types must not be
  // reachable without a person no matter what it assigns (#163): a `pay` rated `low` used to
  // auto-execute, because the low branch returned before the type was ever looked at.
  it.each(['send_email', 'pay', 'submit_form', 'other', 'book_appointment'] as const)(
    'never auto-executes %s, at any tier',
    (type) => {
      for (const riskTier of ['low', 'medium', 'high'] as const) {
        expect(isAutoExecutable({ ...base, type, riskTier })).toBe(false)
        expect(mayExecute({ ...base, type, riskTier })).toMatchObject({ ok: false })
      }
    },
  )

  it('still auto-executes the preparing effects the demo relies on', () => {
    expect(isAutoExecutable({ ...base, riskTier: 'low', type: 'follow_up' })).toBe(true)
    expect(isAutoExecutable({ ...base, riskTier: 'low', type: 'create_calendar_event' })).toBe(true)
    expect(isAutoExecutable({ ...base, riskTier: 'low', type: 'remind' })).toBe(true)
    expect(isAutoExecutable({ ...base, riskTier: 'medium', type: 'draft_email' })).toBe(true)
  })

  it('an approved high-risk action still executes, so the gate is approval and not a ban', () => {
    expect(
      mayExecute({
        ...base,
        type: 'pay',
        riskTier: 'high',
        requiresApproval: true,
        status: 'APPROVED',
      }),
    ).toEqual({ ok: true })
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
