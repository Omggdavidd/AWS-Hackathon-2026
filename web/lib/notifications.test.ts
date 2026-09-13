import type { AuditEvent, AuditKind } from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { buildNotices } from './notifications'

const newest = '2026-09-13T12:00:00.000Z'
const middle = '2026-09-13T09:00:00.000Z'
const oldest = '2026-09-12T09:00:00.000Z'

let seq = 0
function event(kind: AuditKind, loopId: string, at: string): AuditEvent {
  seq += 1
  return { id: `e${seq}`, userId: 'user-1', loopId, at, kind, actor: 'agent', reason: 'because' }
}

const deposit = loop({ id: 'loop-deposit', title: 'Pay registration deposit', status: 'NEEDS_YOU' })
const housing = loop({ id: 'loop-housing', title: 'Housing fee', status: 'RESOLVED' })
const flight = loop({ id: 'loop-flight', title: 'Flight NW 0412', status: 'WATCHING' })

/** What a reader actually sees in the panel. */
function lines(notices: { title: string; text: string }[]): string[] {
  return notices.map((notice) => `${notice.title} ${notice.text}`)
}

describe('buildNotices', () => {
  it('names the loop and says what became of it, newest first', () => {
    const feed = buildNotices(
      [
        event('state_changed', 'loop-housing', newest),
        event('state_changed', 'loop-deposit', middle),
        event('loop_created', 'loop-flight', oldest),
      ],
      [deposit, housing, flight],
    )
    expect(lines(feed.notices)).toEqual([
      'Housing fee is done.',
      'Pay registration deposit needs you.',
      'Flight NW 0412 is new.',
    ])
  })

  it('gives one notice per loop, because five events about one thing are one piece of news', () => {
    const feed = buildNotices(
      [
        event('state_changed', 'loop-deposit', newest),
        event('action_executed', 'loop-deposit', middle),
        event('loop_created', 'loop-deposit', oldest),
      ],
      [deposit],
    )
    expect(feed.notices).toHaveLength(1)
    // Created in this run, so it is news for appearing whatever else happened to it since.
    expect(lines(feed.notices)).toEqual(['Pay registration deposit is new.'])
    expect(feed.notices[0]?.at).toBe(newest)
  })

  it('ignores the agent working: evidence, scans and catch-ups are not news', () => {
    const feed = buildNotices(
      [
        event('evidence_added', 'loop-deposit', newest),
        event('scan_completed', 'loop-deposit', middle),
        event('catch_up', 'loop-deposit', oldest),
      ],
      [deposit],
    )
    expect(feed.notices).toEqual([])
    expect(feed.latestAt).toBeUndefined()
  })

  it('counts everything newer than the last acknowledgement as unread', () => {
    const feed = buildNotices(
      [
        event('state_changed', 'loop-housing', newest),
        event('state_changed', 'loop-deposit', oldest),
      ],
      [deposit, housing],
      middle,
    )
    expect(feed.unread).toBe(1)
    expect(feed.notices.map((n) => n.unread)).toEqual([true, false])
    // Marking all as read stores this, so the badge returns when something newer happens.
    expect(feed.latestAt).toBe(newest)
  })

  it('treats a first visit as all unread, since nothing has been acknowledged yet', () => {
    const feed = buildNotices([event('loop_created', 'loop-deposit', oldest)], [deposit])
    expect(feed.unread).toBe(1)
  })

  it('drops events whose loop is gone, rather than rendering a notice that opens nothing', () => {
    const feed = buildNotices([event('state_changed', 'loop-missing', newest)], [deposit])
    expect(feed.notices).toEqual([])
  })

  it('counts unread beyond the page it shows, so the badge never under-reports', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      loop({ id: `loop-${i}`, title: `Loop ${i}`, status: 'NEEDS_YOU' }),
    )
    const feed = buildNotices(
      many.map((l, i) => event('state_changed', l.id, `2026-09-13T0${i}:00:00.000Z`)),
      many,
      undefined,
      2,
    )
    expect(feed.notices).toHaveLength(2)
    expect(feed.unread).toBe(5)
  })

  it('marks a flagged loop as worth interrupting for, and an ordinary one as not', () => {
    const urgent = loop({ id: 'loop-deposit', status: 'NEEDS_YOU', interruptUser: true })
    const quiet = loop({ id: 'loop-streaming', status: 'NEEDS_YOU', interruptUser: false })
    const feed = buildNotices(
      [
        event('state_changed', 'loop-deposit', newest),
        event('state_changed', 'loop-streaming', oldest),
      ],
      [urgent, quiet],
    )
    expect(feed.notices.map((n) => n.interrupts)).toEqual([true, false])
  })

  it('goes quiet once a flagged loop is resolved, because good news is not an interruption', () => {
    const done = loop({ id: 'loop-deposit', status: 'RESOLVED', interruptUser: true })
    const feed = buildNotices([event('state_changed', 'loop-deposit', newest)], [done])
    expect(feed.notices[0]?.kind).toBe('resolved')
    expect(feed.notices[0]?.interrupts).toBe(false)
  })

  it('prefers "is done" over "was handled" once the loop is closed', () => {
    const feed = buildNotices([event('action_executed', 'loop-housing', newest)], [housing])
    expect(lines(feed.notices)).toEqual(['Housing fee is done.'])
  })
})
