import { describe, expect, it } from 'vitest'
import { backHref, hasSourcePage, messageHref, SOURCE_LABEL } from './source'

describe('which sources can be linked', () => {
  it('links a message or an event, because those have a page', () => {
    expect(hasSourcePage('email')).toBe(true)
    expect(hasSourcePage('calendar')).toBe(true)
  })

  /**
   * The execute path appends evidence with sourceType 'agent' and sourceId `action:<uuid>`
   * (packages/shared/src/actions/fixture-sink.ts). Linking that produced a 404 on the loop page
   * after "Handle what you can", which is worse than plain text.
   */
  it('does not link evidence the agent or the user wrote', () => {
    expect(hasSourcePage('agent')).toBe(false)
    expect(hasSourcePage('user')).toBe(false)
  })

  it('names every source type, so nothing is mislabelled as a calendar event', () => {
    expect(SOURCE_LABEL.email).toBe('Email')
    expect(SOURCE_LABEL.calendar).toBe('Calendar event')
    expect(SOURCE_LABEL.user).toBe('You')
    expect(SOURCE_LABEL.agent).toBe('The agent')
  })
})

describe('links', () => {
  it('carries the loop so the source page can offer a way back', () => {
    expect(messageHref('msg-001', 'loop-deposit')).toBe('/messages/msg-001?loop=loop-deposit')
  })

  it('escapes ids rather than producing a broken link', () => {
    expect(messageHref('action:1234 abcd', 'loop a#1')).toBe(
      '/messages/action%3A1234%20abcd?loop=loop%20a%231',
    )
  })

  it('falls back to home when no loop sent you', () => {
    expect(backHref('loop-deposit')).toEqual({
      href: '/loops/loop-deposit',
      label: '← Back to loop',
    })
    expect(backHref(undefined)).toEqual({ href: '/', label: '← Home' })
    expect(backHref(['a', 'b'])).toEqual({ href: '/', label: '← Home' })
  })
})
