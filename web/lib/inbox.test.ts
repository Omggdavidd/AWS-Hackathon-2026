import { describe, expect, it } from 'vitest'
import seedLedger from '../../demo/seed-ledger.json'
import { getEvent, getMessage, getSource } from './inbox'

describe('the demo inbox behind evidence links', () => {
  it('resolves a message from the base inbox', () => {
    expect(getMessage('msg-001')?.subject).toContain('deposit')
  })

  it('resolves a message the delta batch introduced', () => {
    expect(getMessage('msg-014')).toBeDefined()
  })

  it('resolves a calendar event', () => {
    expect(getEvent('evt-001')?.title).toBeTruthy()
  })

  it('returns undefined for an unknown id, so the page can 404', () => {
    expect(getSource('msg-does-not-exist')).toBeUndefined()
    expect(getMessage('evt-001')).toBeUndefined()
    expect(getEvent('msg-001')).toBeUndefined()
  })

  it('tells the two kinds of source apart', () => {
    expect(getSource('msg-001')?.kind).toBe('email')
    expect(getSource('evt-001')?.kind).toBe('calendar')
  })

  /**
   * The point of the page: every id the expected ledger cites has somewhere to link to. A fixture
   * edit that cites a message nobody added would otherwise show up as a 404 during the demo.
   */
  it('has a source for every id the expected ledger cites', () => {
    const ids = new Set<string>()
    for (const loop of seedLedger.loops) {
      for (const ref of loop.sourceRefs) ids.add(ref.sourceId)
    }
    for (const evidence of seedLedger.evidence ?? []) ids.add(evidence.sourceId)

    const missing = [...ids].filter((id) => getSource(id) === undefined)
    expect(missing).toEqual([])
    expect(ids.size).toBeGreaterThan(0)
  })
})
