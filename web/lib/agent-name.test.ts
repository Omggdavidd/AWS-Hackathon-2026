import { describe, expect, it } from 'vitest'
import { cleanAgentName, NAME_MAX } from './agent-name'

describe('cleanAgentName', () => {
  it('trims, collapses spaces and bounds the length', () => {
    expect(cleanAgentName('  Loop  ')).toBe('Loop')
    expect(cleanAgentName('Ada   Lovelace')).toBe('Ada Lovelace')
    expect(cleanAgentName('x'.repeat(NAME_MAX + 10))).toHaveLength(NAME_MAX)
  })
  it('is undefined for nothing', () => {
    expect(cleanAgentName(undefined)).toBeUndefined()
    expect(cleanAgentName('   ')).toBeUndefined()
  })
})
