import { describe, expect, it } from 'vitest'
import { parseAccent, parseDensity, parseHome } from './appearance'

describe('appearance cookies', () => {
  it('accepts a six-digit hex accent and treats the default as unset', () => {
    expect(parseAccent('#7A4FB5')).toBe('#7a4fb5')
    expect(parseAccent('#177e89')).toBeUndefined()
    expect(parseAccent('red')).toBeUndefined()
    expect(parseAccent('#fff')).toBeUndefined()
    expect(parseAccent(undefined)).toBeUndefined()
  })
  it('falls back to comfortable and today', () => {
    expect(parseDensity('compact')).toBe('compact')
    expect(parseDensity('dense')).toBe('comfortable')
    expect(parseHome('board')).toBe('board')
    expect(parseHome('list')).toBe('today')
  })
})
