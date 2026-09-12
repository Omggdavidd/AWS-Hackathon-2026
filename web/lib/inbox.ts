import type { CalendarEvent, EmailMessage } from '@openloop/shared'
import { FixtureSource } from '@openloop/shared'
import baseInbox from '../../demo/seed-inbox.json'
import deltaInbox from '../../demo/seed-inbox-delta.json'

/**
 * The demo inbox behind every evidence link (SPEC §12: a claim the agent makes must be traceable
 * to its source). Base plus the later batch, the same merge the agent scans, so a message the
 * delta introduced is viewable too.
 *
 * Bundled rather than read from disk: these are fixtures, not credentials, and a static import
 * survives deployment where a relative path out of the app directory does not. Parsed by
 * `FixtureSource`, so what the page renders is a validated Zod type (ADR-0006).
 */
const source = FixtureSource.fromDataWithDelta(baseInbox, deltaInbox)

export function getMessage(id: string): EmailMessage | undefined {
  return source.fixture.messages.find((m) => m.id === id)
}

export function getEvent(id: string): CalendarEvent | undefined {
  return source.fixture.events.find((e) => e.id === id)
}

export type Source =
  | { kind: 'email'; message: EmailMessage }
  | { kind: 'calendar'; event: CalendarEvent }

/** One lookup for both kinds, because a source ref only carries an id and a type. */
export function getSource(id: string): Source | undefined {
  const message = getMessage(id)
  if (message) return { kind: 'email', message }
  const event = getEvent(id)
  if (event) return { kind: 'calendar', event }
  return undefined
}

/** The persona whose inbox this is, for the "to" line and the page heading. */
export const PERSONA = source.fixture.persona
