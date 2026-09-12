import { fileURLToPath } from 'node:url'
import {
  FixtureActionSink,
  FixtureSource,
  LocalLedgerStore,
  type ProposedAction,
} from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { executeAction, handleWhatYouCan } from '../src/actions'
import type { Specialists } from '../src/agents'
import type { LogLine } from '../src/log'

const seed = fileURLToPath(new URL('../../../../demo/seed-inbox.json', import.meta.url))
const now = '2026-09-10T13:00:00.000Z'

const specialists = {
  async plan({ action }: { action: ProposedAction }) {
    if (action.type === 'follow_up') {
      return {
        effect: {
          kind: 'send_email',
          to: 'bill@example.com',
          subject: 'Following up',
          body: 'Hi Bill…',
        },
        summary: 'Sent follow-up',
        loopStatusAfter: 'WAITING',
      }
    }
    if (action.type === 'pay')
      return { effect: { kind: 'note', text: 'Paid $200 at the portal' }, summary: 'Paid' }
    return {
      effect: {
        kind: 'draft_email',
        to: 'office@maplecourtpm.com',
        subject: 'Re: insurance',
        body: 'Attached.',
      },
      summary: 'Drafted reply',
    }
  },
} as unknown as Specialists

function action(over: Partial<ProposedAction>): ProposedAction {
  return {
    id: 'a',
    loopId: 'loop-1',
    userId: 'user-1',
    type: 'draft_email',
    riskTier: 'medium',
    requiresApproval: false,
    summary: 'Draft reply',
    payload: {},
    status: 'PROPOSED',
    createdAt: now,
    ...over,
  }
}

async function setup() {
  const store = new LocalLedgerStore()
  const source = await FixtureSource.load(seed)
  const sink = new FixtureActionSink()
  await store.putLoop(
    loop({ sourceRefs: [{ sourceType: 'email', sourceId: 'msg-004', threadId: 'thr-insurance' }] }),
  )
  return { store, source, sink, userId: 'user-1', specialists, now }
}

describe('executeAction', () => {
  it('runs an allowed action, records evidence, marks it executed', async () => {
    const opts = await setup()
    await opts.store.putAction(action({ id: 'draft' }))
    const out = await executeAction(opts, 'draft')
    expect(out.status).toBe('EXECUTED')
    const stored = await opts.store.getAction('user-1', 'draft')
    expect(stored).toMatchObject({
      status: 'EXECUTED',
      payload: { effect: { kind: 'draft_email' } },
    })
    expect((await opts.store.listEvidence('loop-1')).map((e) => e.sourceId)).toEqual([
      'action:draft',
    ])
    expect((await opts.store.listAudit('user-1'))[0]?.kind).toBe('action_executed')
    expect(opts.sink.log).toHaveLength(1)
  })

  it('refuses a high-risk action that is not approved and never calls the sink', async () => {
    const opts = await setup()
    await opts.store.putAction(
      action({ id: 'pay', type: 'pay', riskTier: 'high', requiresApproval: true }),
    )
    const out = await executeAction(opts, 'pay')
    expect(out).toMatchObject({ status: 'PROPOSED', summary: 'requires your approval' })
    expect(opts.sink.log).toHaveLength(0)
    expect((await opts.store.listAudit('user-1'))[0]).toMatchObject({ kind: 'action_failed' })
  })

  it('executes the same high-risk action once approved', async () => {
    const opts = await setup()
    await opts.store.putAction(
      action({
        id: 'pay',
        type: 'pay',
        riskTier: 'high',
        requiresApproval: true,
        status: 'APPROVED',
      }),
    )
    expect((await executeAction(opts, 'pay')).status).toBe('EXECUTED')
    expect((await executeAction(opts, 'pay')).summary).toBe('already executed')
  })

  it('logs the action as a pipeline: the plan role, the sink and the outcome', async () => {
    const opts = await setup()
    const lines: LogLine[] = []
    await opts.store.putAction(action({ id: 'draft' }))
    await executeAction({ ...opts, logger: (l) => lines.push(l) }, 'draft')

    expect(lines.map((l) => l.evt)).toEqual(['action_started', 'role', 'sink', 'action_executed'])
    expect(lines[1]).toMatchObject({ role: 'plan', actionId: 'draft', threadId: 'thr-insurance' })
    expect(lines[2]).toMatchObject({ evt: 'sink', effect: { kind: 'draft_email' } })
    expect(lines.slice(1).every((l) => typeof l.ms === 'number')).toBe(true)
  })

  it('logs a blocked high-risk action with the reason and never reaches the sink', async () => {
    const opts = await setup()
    const lines: LogLine[] = []
    await opts.store.putAction(
      action({ id: 'pay', type: 'pay', riskTier: 'high', requiresApproval: true }),
    )
    await executeAction({ ...opts, logger: (l) => lines.push(l) }, 'pay')

    expect(lines.map((l) => l.evt)).toEqual(['action_started', 'action_blocked'])
    expect(lines[1]).toMatchObject({ actionId: 'pay', reason: 'requires your approval' })
    expect(opts.sink.log).toHaveLength(0)
  })

  it('moves the loop when the plan says who owes the next move', async () => {
    const opts = await setup()
    await opts.store.putAction(action({ id: 'fu', type: 'follow_up', riskTier: 'low' }))
    await executeAction(opts, 'fu')
    expect((await opts.store.getLoop('user-1', 'loop-1'))?.status).toBe('WAITING')
  })
})

describe('handleWhatYouCan', () => {
  it('cancels proposed actions whose loop is already resolved', async () => {
    const opts = await setup()
    await opts.store.putLoop(
      loop({
        id: 'done-loop',
        status: 'RESOLVED',
        resolvedAt: now,
        sourceRefs: [{ sourceType: 'email', sourceId: 'msg-002', threadId: 'thr-housing' }],
      }),
    )
    await opts.store.putAction(action({ id: 'stale', loopId: 'done-loop' }))
    const result = await handleWhatYouCan(opts)
    expect(result.handled).toHaveLength(0)
    expect((await opts.store.getAction('user-1', 'stale'))?.status).toBe('CANCELLED')
    expect(opts.sink.log).toHaveLength(0)
  })

  it('executes what policy allows and lists what needs the user', async () => {
    const opts = await setup()
    await opts.store.putAction(action({ id: 'draft' }))
    await opts.store.putAction(
      action({ id: 'pay', type: 'pay', riskTier: 'high', requiresApproval: true }),
    )
    await opts.store.putAction(action({ id: 'done', status: 'EXECUTED' }))
    const result = await handleWhatYouCan(opts)
    expect(result.handled.map((h) => h.actionId)).toEqual(['draft'])
    expect(result.needsYou.map((n) => n.actionId)).toEqual(['pay'])
  })
})
