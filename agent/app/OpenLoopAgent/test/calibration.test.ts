import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { FixtureSource, OpenLoop } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { agreementOptions, calibrationInput, compareRuns } from '../src/agreement'

const fixture = (
  await FixtureSource.load(
    fileURLToPath(new URL('../../../../demo/seed-inbox.json', import.meta.url)),
  )
).fixture
const ledger = JSON.parse(
  await readFile(new URL('../../../../demo/seed-ledger.json', import.meta.url), 'utf8'),
)
const expected = ledger.loops.map((loop: unknown) => OpenLoop.parse(loop))

describe('calibration configuration', () => {
  it('defaults to one subset run and supports explicit final verification', () => {
    expect(agreementOptions([])).toEqual({ runs: 1, full: false, verbose: false })
    expect(agreementOptions(['--', '--full', '--verbose'], '3')).toEqual({
      runs: 3,
      full: true,
      verbose: true,
    })
  })
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '', '9007199254740992'])(
    'rejects invalid run count %s',
    (value) => {
      expect(() => agreementOptions([], value)).toThrow('positive safe integer')
    },
  )
  it('rejects misspelled flags', () => {
    expect(() => agreementOptions(['--ful'])).toThrow('Unknown argument')
  })
  it('selects complete threads, preserves calendar context and leaves the demo untouched', () => {
    const before = structuredClone(fixture)
    const input = calibrationInput(fixture, expected, false)
    expect(new Set(input.fixture.messages.map((m) => m.threadId))).toEqual(new Set(input.threadIds))
    expect(input.threadIds).toHaveLength(4)
    for (const id of input.threadIds) {
      expect(input.fixture.messages.filter((m) => m.threadId === id)).toEqual(
        fixture.messages.filter((m) => m.threadId === id),
      )
    }
    expect(input.fixture.events).toEqual(fixture.events)
    expect(fixture).toEqual(before)
    expect(input.expected).toHaveLength(3)
    const report = compareRuns(input.expected, [input.expected], input.threadIds)
    expect(report).toMatchObject({ agreed: 4, total: 4 })
    expect(report.rows.find((r) => r.threadId === 'thr-newsletter')).toMatchObject({
      expected: 'none',
      runs: ['none'],
      agrees: true,
    })
    const falsePositive = {
      status: 'WATCHING' as const,
      sourceRefs: [
        { sourceType: 'email' as const, sourceId: 'newsletter', threadId: 'thr-newsletter' },
      ],
    }
    expect(
      compareRuns(input.expected, [[...input.expected, falsePositive]], input.threadIds),
    ).toMatchObject({ agreed: 3, total: 4 })
  })
  it('fails if the representative fixture disappears', () => {
    expect(() => calibrationInput({ ...fixture, messages: [] }, expected, false)).toThrow(
      'missing from fixture',
    )
  })
  it('full mode retains every message and expected loop', () => {
    const input = calibrationInput(fixture, expected, true)
    expect(input.fixture).toEqual(fixture)
    expect(input.expected).toEqual(expected)
    expect(input.threadIds).toHaveLength(12)
  })
})
