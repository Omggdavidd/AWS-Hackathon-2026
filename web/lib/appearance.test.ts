import { describe, expect, it } from 'vitest'
import { parseAccent, parseDensity, parseHome, parseTheme } from './appearance'

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

describe('parseTheme', () => {
  it('reads the three grounds and falls back to light', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('midnight')).toBe('midnight')
    expect(parseTheme(undefined)).toBe('light')
    expect(parseTheme('DARK')).toBe('light')
    expect(parseTheme('super-dark')).toBe('light')
  })
})
