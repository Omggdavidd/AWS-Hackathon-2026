import { describe, expect, it } from 'vitest'
import { applyTransition, canTransition, InvalidTransitionError } from '../src/index'
import { loop } from './store-contract'

describe('transitions', () => {
  it('allows evidence to move any state and resolution from any state', () => {
    expect(canTransition('WAITING', 'NEEDS_YOU')).toBe(true)
    expect(canTransition('NEEDS_YOU', 'RESOLVED')).toBe(true)
    expect(canTransition('WATCHING', 'RESOLVED')).toBe(true)
    expect(canTransition('RESOLVED', 'NEEDS_YOU')).toBe(true)
  })

  it('rejects no-op transitions and resolving into UNCERTAIN', () => {
    expect(canTransition('NEEDS_YOU', 'NEEDS_YOU')).toBe(false)
    expect(canTransition('RESOLVED', 'UNCERTAIN')).toBe(false)
  })

  it('stamps resolvedAt on RESOLVED and clears it on reopen', () => {
    const resolved = applyTransition(loop(), 'RESOLVED', '2026-09-10T00:00:00.000Z')
    expect(resolved.resolvedAt).toBe('2026-09-10T00:00:00.000Z')
    const reopened = applyTransition(resolved, 'NEEDS_YOU', '2026-09-11T00:00:00.000Z')
    expect(reopened.resolvedAt).toBeUndefined()
    expect(reopened.updatedAt).toBe('2026-09-11T00:00:00.000Z')
  })

  it('throws on an invalid transition', () => {
    expect(() =>
      applyTransition(loop({ status: 'RESOLVED' }), 'UNCERTAIN', '2026-09-10T00:00:00.000Z'),
    ).toThrow(InvalidTransitionError)
  })
})
