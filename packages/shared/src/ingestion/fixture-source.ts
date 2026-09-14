import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  byDateAscending,
  CalendarEvent,
  EmailMessage,
  type IngestionSource,
  type MessageQuery,
  matchesMessageQuery,
} from './source'

const FixtureFile = z.object({
  persona: z.object({ name: z.string(), email: z.string(), now: z.string() }),
  messages: z.array(EmailMessage),
  events: z.array(CalendarEvent),
})
export type FixtureFile = z.infer<typeof FixtureFile>

/** Overlay a later batch of messages and events on a base fixture; later `persona.now` wins. */
export function mergeFixtures(base: FixtureFile, delta: FixtureFile): FixtureFile {
  const seen = new Set(base.messages.map((m) => m.id))
  const seenEvents = new Set(base.events.map((e) => e.id))
  return {
    persona: delta.persona,
    messages: [...base.messages, ...delta.messages.filter((m) => !seen.has(m.id))],
    events: [...base.events, ...delta.events.filter((e) => !seenEvents.has(e.id))],
  }
}

/** Seeded inbox and calendar for the deterministic demo (SPEC §14). */
export class FixtureSource implements IngestionSource {
  private constructor(readonly fixture: FixtureFile) {}

  static async load(filePath: string): Promise<FixtureSource> {
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    return new FixtureSource(FixtureFile.parse(raw))
  }

  static fromData(data: unknown): FixtureSource {
    return new FixtureSource(FixtureFile.parse(data))
  }

  /** Base inbox plus a later batch (see demo/README.md). */
  static fromDataWithDelta(base: unknown, delta: unknown): FixtureSource {
    return new FixtureSource(mergeFixtures(FixtureFile.parse(base), FixtureFile.parse(delta)))
  }

  async listMessages(query: MessageQuery = {}): Promise<EmailMessage[]> {
    return this.fixture.messages.filter((m) => matchesMessageQuery(m, query)).sort(byDateAscending)
  }

  async getThread(threadId: string): Promise<EmailMessage[]> {
    return this.listMessages({ threadId })
  }

  async listEvents(range: { from?: string; to?: string } = {}): Promise<CalendarEvent[]> {
    return this.fixture.events
      .filter(
        (e) =>
          (range.from === undefined || e.end >= range.from) &&
          (range.to === undefined || e.start <= range.to),
      )
      .sort((a, b) => a.start.localeCompare(b.start))
  }
}
