import type { CalendarEvent, EmailMessage } from '@openloop/shared'
import { FixtureSource } from '@openloop/shared'
import baseInbox from '../../demo/seed-inbox.json'
import deltaInbox from '../../demo/seed-inbox-delta.json'

/**
 * The demo inbox behind every evidence link, base merged with the later batch so a message the
 * delta introduced is viewable too. Bundled rather than read from disk: these are fixtures, not
 * credentials, and a static import survives deployment where a relative path out of the app
 * directory does not. Parsed by `FixtureSource`, so pages render validated Zod types (ADR-0006).
 */
const source = FixtureSource.fromDataWithDelta(baseInbox, deltaInbox)

/** One email by id, or undefined so the page can 404. */
export function getMessage(id: string): EmailMessage | undefined {
  return source.fixture.messages.find((m) => m.id === id)
}

/** One calendar event by id, or undefined so the page can 404. */
export function getEvent(id: string): CalendarEvent | undefined {
  return source.fixture.events.find((e) => e.id === id)
}

export type Source =
  | { kind: 'email'; message: EmailMessage }
  | { kind: 'calendar'; event: CalendarEvent }

/** One lookup for both kinds, because a source ref carries only an id and a type. */
export function getSource(id: string): Source | undefined {
  const message = getMessage(id)
  if (message) return { kind: 'email', message }
  const event = getEvent(id)
  if (event) return { kind: 'calendar', event }
  return undefined
}
