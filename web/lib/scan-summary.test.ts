import { ScanSummary } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { formatScanCounts, formatScanStatus } from './scan-summary'

/** The runtime sends the summary as JSON over SSE, so tests go through the schema as the panel does. */
const summary = (over: Partial<ScanSummary> = {}): ScanSummary =>
  ScanSummary.parse({ threads: 12, skipped: 1, created: 10, updated: 0, ...over })

describe('formatScanStatus', () => {
  it('reports a clean scan with no mention of failure', () => {
    expect(formatScanStatus(summary())).toBe('10 things worth tracking across 12 threads.')
  })

  it('says how much of the inbox it could not read', () => {
    expect(formatScanStatus(summary({ created: 9, failed: 1 }))).toBe(
      '9 things worth tracking across 11 of 12 threads. 1 thread could not be read, so anything in it is missing from your list.',
    )
    expect(formatScanStatus(summary({ created: 7, failed: 3 }))).toBe(
      '7 things worth tracking across 9 of 12 threads. 3 threads could not be read, so anything in them is missing from your list.',
    )
  })

  it('separates a scan that read nothing from a scan that found nothing', () => {
    expect(formatScanStatus(summary({ created: 0, skipped: 12, failed: 0 }))).toBe(
      '0 things worth tracking across 12 threads.',
    )
    expect(formatScanStatus(summary({ created: 0, skipped: 0, failed: 12 }))).toBe(
      'None of your mail could be read. Nothing was tracked, so run the scan again.',
    )
  })

  it('keeps counting what it did track when every thread failed after opening a loop', () => {
    expect(formatScanStatus(summary({ created: 2, skipped: 0, failed: 12 }))).toBe(
      '2 things worth tracking across 0 of 12 threads. 12 threads could not be read, so anything in them is missing from your list.',
    )
  })

  it('reads as one thing and one thread', () => {
    expect(formatScanStatus(summary({ threads: 1, skipped: 0, created: 1 }))).toBe(
      '1 thing worth tracking across 1 thread.',
    )
  })

  it('treats a runtime that sends no count as none failed', () => {
    expect(ScanSummary.parse({ threads: 12, skipped: 1, created: 10, updated: 0 }).failed).toBe(0)
  })
})

describe('formatScanCounts', () => {
  it('leaves a clean scan as three counts', () => {
    expect(formatScanCounts(summary())).toBe('10 new, 0 updated, 1 skipped.')
  })

  it('adds the threads it could not read', () => {
    expect(formatScanCounts(summary({ created: 9, failed: 1 }))).toBe(
      '9 new, 0 updated, 1 skipped, 1 could not be read.',
    )
  })
})
