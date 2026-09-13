import type { AuditEvent, AuditKind } from '@openloop/shared'
import { loop } from '@openloop/shared/testing'
import { describe, expect, it } from 'vitest'
import { type ChangeSummary, summarizeChanges } from './changes'

const now = new Date('2026-09-13T13:00:00.000Z')
const recent = '2026-09-13T09:00:00.000Z'
const old = '2026-09-10T13:00:00.000Z'

let seq = 0
function event(kind: AuditKind, loopId: string, at = recent): AuditEvent {
  seq += 1
  return {
    id: `e${seq}`,
    userId: 'user-1',
    loopId,
    at,
    kind,
    actor: 'agent',
    reason: 'because',
  }
}

/** The banner renders segments; this is what a reader would actually see. */
function text(summary: ChangeSummary | undefined): string[] {
  return (summary?.sentences ?? []).map((s) => s.map((seg) => seg.text).join(''))
}

const deposit = loop({ id: 'loop-deposit', title: 'Pay registration deposit', status: 'RESOLVED' })
const library = loop({ id: 'loop-library', title: 'Return library books', status: 'NEEDS_YOU' })
const flight = loop({ id: 'loop-flight', title: 'Flight NW 0412', status: 'WATCHING' })

describe('summarizeChanges', () => {
  it('says what closed and what is new, which is the delta run a judge sees', () => {
    const summary = summarizeChanges(
      [
        event('state_changed', 'loop-deposit'),
        event('loop_created', 'loop-library'),
        event('evidence_added', 'loop-flight'),
      ],
      [deposit, library, flight],
      now,
    )
    expect(text(summary)).toEqual([
      'Pay registration deposit is done.',
      'Return library books is new.',
    ])
  })

  it('links every named loop so the banner is a way in, not just a notice', () => {
    const summary = summarizeChanges(
      [event('state_changed', 'loop-deposit'), event('loop_created', 'loop-library')],
      [deposit, library],
      now,
    )
    const linked = summary?.sentences.flat().filter((s) => s.loopId)
    expect(linked?.map((s) => [s.text, s.loopId])).toEqual([
      ['Pay registration deposit', 'loop-deposit'],
      ['Return library books', 'loop-library'],
    ])
  })

  it('is silent when nothing notable happened', () => {
    expect(summarizeChanges([], [deposit], now)).toBeUndefined()
    // Evidence and scans are the agent working, not a change in the world.
    expect(
      summarizeChanges(
        [event('evidence_added', 'loop-flight'), event('scan_completed', 'loop-flight')],
        [flight],
        now,
      ),
    ).toBeUndefined()
  })

  it('ignores anything older than a day, so a cold seeded ledger shows no banner', () => {
    const summary = summarizeChanges(
      [event('loop_created', 'loop-library', old), event('state_changed', 'loop-deposit', old)],
      [library, deposit],
      now,
    )
    expect(summary).toBeUndefined()
  })

  it('names two loops, then counts the rest', () => {
    const closed = ['a', 'b', 'c', 'd'].map((id) =>
      loop({ id, title: id.toUpperCase(), status: 'RESOLVED' }),
    )
    const summary = summarizeChanges(
      closed.map((l) => event('state_changed', l.id)),
      closed,
      now,
    )
    expect(text(summary)).toEqual(['A, B and 2 more are done.'])
  })

  it('uses the plural when two loops close', () => {
    const second = loop({ id: 'loop-2', title: 'Pay housing fee', status: 'RESOLVED' })
    const summary = summarizeChanges(
      [event('state_changed', 'loop-deposit'), event('state_changed', 'loop-2')],
      [deposit, second],
      now,
    )
    expect(text(summary)).toEqual(['Pay registration deposit and Pay housing fee are done.'])
  })

  it('falls back to what needs you when nothing closed and nothing is new', () => {
    const waiting = loop({ id: 'loop-issue1', title: 'Issue #1 write-up', status: 'NEEDS_YOU' })
    const summary = summarizeChanges([event('state_changed', 'loop-issue1')], [waiting], now)
    expect(text(summary)).toEqual(['Issue #1 write-up needs you.'])
  })

  it('reports the agent working when it executed something but no loop closed', () => {
    const summary = summarizeChanges([event('action_executed', 'loop-flight')], [flight], now)
    expect(text(summary)).toEqual(['The agent handled one action.'])
  })

  it('watermarks the newest event so dismissal can expire', () => {
    const newest = '2026-09-13T11:00:00.000Z'
    const summary = summarizeChanges(
      [
        event('state_changed', 'loop-deposit', recent),
        event('loop_created', 'loop-library', newest),
      ],
      [deposit, library],
      now,
    )
    expect(summary?.latestAt).toBe(newest)
  })
})
