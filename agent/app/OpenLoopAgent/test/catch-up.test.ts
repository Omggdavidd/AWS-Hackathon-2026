import { type AuditEvent, LocalLedgerStore } from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { buildDigest, catchUp, lastCheck } from '../src/catch-up'

const now = '2026-09-11T13:00:00.000Z'
const ev = (id: string, at: string, kind: AuditEvent['kind'], loopId?: string): AuditEvent => ({
  id,
  userId: 'user-1',
  at,
  kind,
  actor: 'agent',
  reason: `${kind} reason`,
  ...(loopId ? { loopId } : {}),
})

describe('lastCheck', () => {
  it('uses the previous catch_up, else 24 hours ago', () => {
    expect(lastCheck([ev('c', '2026-09-11T08:00:00.000Z', 'catch_up')], now)).toBe(
      '2026-09-11T08:00:00.000Z',
    )
    expect(lastCheck([], now)).toBe('2026-09-10T13:00:00.000Z')
  })
})

describe('buildDigest', () => {
  it('collects changes in the window, needs-you, near deadlines and waiting', () => {
    const loops = [
      loop({ id: 'dep', title: 'Deposit', status: 'RESOLVED', dueAt: '2026-09-15T00:00:00.000Z' }),
      loop({
        id: 'ins',
        title: 'Insurance',
        status: 'NEEDS_YOU',
        dueAt: '2026-09-12T00:00:00.000Z',
      }),
      loop({ id: 'far', title: 'Flight', status: 'WATCHING', dueAt: '2026-10-17T00:00:00.000Z' }),
      loop({ id: 'bill', title: 'Write-up', status: 'WAITING', waitingOn: 'Bill' }),
    ]
    const audit = [
      ev('a1', '2026-09-11T12:00:00.000Z', 'state_changed', 'dep'),
      ev('a2', '2026-09-09T12:00:00.000Z', 'loop_created', 'ins'),
      ev('a3', '2026-09-11T12:30:00.000Z', 'scan_completed'),
    ]
    const d = buildDigest(loops, audit, '2026-09-10T13:00:00.000Z', now)
    expect(d.changes.map((c) => c.loopId)).toEqual(['dep'])
    expect(d.needsYou.map((n) => n.loopId)).toEqual(['ins'])
    expect(d.deadlinesSoon.map((n) => n.loopId)).toEqual(['ins'])
    expect(d.waiting).toEqual([{ loopId: 'bill', title: 'Write-up', waitingOn: 'Bill' }])
  })
})

describe('catchUp', () => {
  it('summarizes through the specialist and marks the check in the audit trail', async () => {
    const store = new LocalLedgerStore()
    await store.putLoop(loop({ id: 'dep', title: 'Deposit', status: 'RESOLVED' }))
    await store.appendAudit(ev('a1', '2026-09-11T12:00:00.000Z', 'state_changed', 'dep'))
    const specialists = {
      async summarize({ digest }: { digest: { changes: unknown[] } }) {
        return {
          headline: `${digest.changes.length} change`,
          items: [{ loopId: 'dep', title: 'Deposit', kind: 'resolved' as const, text: 'Paid.' }],
          nothingElse: false,
        }
      },
    }
    const first = await catchUp({ store, userId: 'user-1', specialists, now })
    expect(first.headline).toBe('1 change')
    expect(first.since).toBe('2026-09-10T13:00:00.000Z')
    const later = '2026-09-11T14:00:00.000Z'
    const second = await catchUp({ store, userId: 'user-1', specialists, now: later })
    expect(second.since).toBe(now)
    expect(second.headline).toBe('0 change')
    expect((await store.listAudit('user-1'))[0]).toMatchObject({ kind: 'catch_up', actor: 'user' })
  })
})
