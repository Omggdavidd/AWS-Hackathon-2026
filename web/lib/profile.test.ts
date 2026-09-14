import { describe, expect, it } from 'vitest'
import {
  cleanEmail,
  DEMO_INBOX,
  DEMO_NAME,
  INBOX_COOKIE,
  PURPOSE_COOKIE,
  parsePurpose,
  readProfile,
  YOU_COOKIE,
} from './profile'

const jar = (values: Record<string, string>) => ({
  get: (name: string) => (name in values ? { value: values[name] as string } : undefined),
})

describe('cleanEmail', () => {
  it('lowercases and trims an address', () => {
    expect(cleanEmail('  Sam@Example.COM ')).toBe('sam@example.com')
  })
  it('rejects anything that does not look like an address', () => {
    for (const bad of ['', 'sam', 'sam@', '@example.com', 'sam @example.com', 'sam@example'])
      expect(cleanEmail(bad)).toBeUndefined()
  })
})

describe('parsePurpose', () => {
  it('accepts only the four purposes', () => {
    expect(parsePurpose('work')).toBe('work')
    expect(parsePurpose('hobby')).toBe('hobby')
    expect(parsePurpose('other')).toBeUndefined()
    expect(parsePurpose(undefined)).toBeUndefined()
  })
})

describe('readProfile', () => {
  it('falls back to the demo persona field by field', () => {
    expect(readProfile(jar({}))).toEqual({ name: DEMO_NAME, inbox: DEMO_INBOX, purpose: 'school' })
    expect(readProfile(jar({ [YOU_COOKIE]: 'Sam', [INBOX_COOKIE]: 'not an address' }))).toEqual({
      name: 'Sam',
      inbox: DEMO_INBOX,
      purpose: 'school',
    })
  })
  it('reads all three when they are valid', () => {
    expect(
      readProfile(
        jar({ [YOU_COOKIE]: 'Sam', [INBOX_COOKIE]: 'Sam@Work.io', [PURPOSE_COOKIE]: 'work' }),
      ),
    ).toEqual({ name: 'Sam', inbox: 'sam@work.io', purpose: 'work' })
  })
})
