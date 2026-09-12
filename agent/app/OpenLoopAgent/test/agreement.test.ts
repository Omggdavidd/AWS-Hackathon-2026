import type { LoopStatus } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { compareRuns, type LoopStatusRef } from '../src/agreement'

/** A loop the way a run produces it: one thread, one status. */
function on(threadId: string, status: LoopStatus): LoopStatusRef {
  return { status, sourceRefs: [{ sourceType: 'email', sourceId: `msg-${threadId}`, threadId }] }
}

const expected = [
  on('thr-deposit', 'NEEDS_YOU'),
  on('thr-club', 'WATCHING'),
  on('thr-issue1', 'WAITING'),
]

describe('compareRuns', () => {
  it('agrees when every run reproduces the expected ledger', () => {
    const run = [
      on('thr-club', 'WATCHING'),
      on('thr-issue1', 'WAITING'),
      on('thr-deposit', 'NEEDS_YOU'),
    ]
    const report = compareRuns(expected, [run, run, run])

    expect(report).toMatchObject({ runs: 3, agreed: 3, total: 3 })
    expect(report.rows).toEqual([
      {
        threadId: 'thr-deposit',
        expected: 'NEEDS_YOU',
        runs: ['NEEDS_YOU', 'NEEDS_YOU', 'NEEDS_YOU'],
        agrees: true,
      },
      {
        threadId: 'thr-club',
        expected: 'WATCHING',
        runs: ['WATCHING', 'WATCHING', 'WATCHING'],
        agrees: true,
      },
      {
        threadId: 'thr-issue1',
        expected: 'WAITING',
        runs: ['WAITING', 'WAITING', 'WAITING'],
        agrees: true,
      },
    ])
  })

  it('marks a thread that disagrees in one run out of three', () => {
    const good = [
      on('thr-deposit', 'NEEDS_YOU'),
      on('thr-club', 'WATCHING'),
      on('thr-issue1', 'WAITING'),
    ]
    const bad = [
      on('thr-deposit', 'NEEDS_YOU'),
      on('thr-club', 'NEEDS_YOU'),
      on('thr-issue1', 'WAITING'),
    ]
    const report = compareRuns(expected, [good, bad, good])

    expect(report).toMatchObject({ runs: 3, agreed: 2, total: 3 })
    expect(report.rows.find((r) => r.threadId === 'thr-club')).toEqual({
      threadId: 'thr-club',
      expected: 'WATCHING',
      runs: ['WATCHING', 'NEEDS_YOU', 'WATCHING'],
      agrees: false,
    })
  })

  it('reports a thread a run produced no loop for as missing', () => {
    const report = compareRuns(expected, [
      [on('thr-deposit', 'NEEDS_YOU'), on('thr-club', 'WATCHING')],
    ])

    expect(report).toMatchObject({ runs: 1, agreed: 2, total: 3 })
    expect(report.rows.find((r) => r.threadId === 'thr-issue1')).toEqual({
      threadId: 'thr-issue1',
      expected: 'WAITING',
      runs: ['none'],
      agrees: false,
    })
  })

  it('appends a thread the expected ledger does not have', () => {
    const report = compareRuns(expected, [
      [
        on('thr-deposit', 'NEEDS_YOU'),
        on('thr-club', 'WATCHING'),
        on('thr-issue1', 'WAITING'),
        on('thr-newsletter', 'WATCHING'),
      ],
    ])

    expect(report).toMatchObject({ agreed: 3, total: 4 })
    expect(report.rows[3]).toEqual({
      threadId: 'thr-newsletter',
      expected: 'none',
      runs: ['WATCHING'],
      agrees: false,
    })
  })
})
