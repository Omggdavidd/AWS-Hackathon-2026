import { FixtureSource, LocalLedgerStore } from '@openloop/shared'
import type { Model } from '@strands-agents/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpecialists } from '../src/agents'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@strands-agents/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@strands-agents/sdk')>()),
  Agent: class {
    invoke = invoke
  },
}))

const now = '2026-09-11T13:00:00.000Z'

function specialists() {
  return createSpecialists({
    model: {} as Model,
    source: FixtureSource.fromData({
      persona: { name: 'Alex Rivera', email: 'alex@example.edu', now },
      messages: [],
      events: [],
    }),
    store: new LocalLedgerStore(),
    userId: 'user-1',
  })
}

describe('createSpecialists', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('returns the parsed structured output', async () => {
    invoke.mockResolvedValue({
      structuredOutput: {
        isResponsibility: false,
        confidence: 0.9,
        rationale: 'A newsletter asks nothing of anyone.',
      },
    })

    await expect(specialists().extract({ thread: [], now })).resolves.toMatchObject({
      isResponsibility: false,
    })
  })

  it('names the role and the failing paths when the output does not match the schema', async () => {
    invoke.mockResolvedValue({
      structuredOutput: { isResponsibility: 'yes', confidence: 0.9, rationale: 'Alex owes money.' },
    })

    await expect(specialists().extract({ thread: [], now })).rejects.toThrow(
      /^extract returned output its schema rejected:.*isResponsibility/,
    )
  })

  it('names whichever role failed, and never quotes the output: it carries the user mail', async () => {
    invoke.mockResolvedValue({
      structuredOutput: { riskTier: 'catastrophic', consequence: 'Alex loses the deposit.' },
    })

    const rejection = specialists().judge({ loop: {} as never, evidence: [], now })

    await expect(rejection).rejects.toThrow(/^judge returned output its schema rejected:.*riskTier/)
    await expect(rejection).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('deposit') }),
    )
  })
})
